# -*- coding: utf-8; -*-
#
# This file is part of Superdesk.
#
# Copyright 2013, 2014 Sourcefabric z.u. and contributors.
#
# For the full copyright and license information, please see the
# AUTHORS and LICENSE files distributed with this source code, or
# at https://www.sourcefabric.org/superdesk/license

"""Superdesk Events"""

import superdesk
import logging
from superdesk import get_resource_service
from superdesk.errors import SuperdeskApiError
from superdesk.metadata.utils import generate_guid
from superdesk.metadata.item import GUID_NEWSML
from superdesk.notification import push_notification
from apps.auth import get_user, get_user_id
from apps.archive.common import set_original_creator, get_auth
from superdesk.users.services import current_user_has_privilege
from .events_base_service import EventsBaseService
from planning.common import UPDATE_SINGLE, UPDATE_FUTURE, get_max_recurrent_events, \
    WORKFLOW_STATE, ITEM_STATE, remove_lock_information, format_address, update_published_item
from dateutil.rrule import rrule, YEARLY, MONTHLY, WEEKLY, DAILY, MO, TU, WE, TH, FR, SA, SU
from eve.defaults import resolve_default_values
from eve.methods.common import resolve_document_etag
from eve.utils import config
from flask import current_app as app
import itertools
import copy
import pytz
import re
from copy import deepcopy

from .events_schema import events_schema

logger = logging.getLogger(__name__)

FREQUENCIES = {'DAILY': DAILY, 'WEEKLY': WEEKLY, 'MONTHLY': MONTHLY, 'YEARLY': YEARLY}
DAYS = {'MO': MO, 'TU': TU, 'WE': WE, 'TH': TH, 'FR': FR, 'SA': SA, 'SU': SU}

organizer_roles = {
    'eorol:artAgent': 'Artistic agent',
    'eorol:general': 'General organiser',
    'eorol:tech': 'Technical organiser',
    'eorol:travAgent': 'Travel agent',
    'eorol:venue': 'Venue organiser'
}


class EventsService(superdesk.Service):
    """Service class for the events model."""

    def post_in_mongo(self, docs, **kwargs):
        for doc in docs:
            resolve_default_values(doc, app.config['DOMAIN'][self.datasource]['defaults'])
        self.on_create(docs)
        resolve_document_etag(docs, self.datasource)
        ids = self.backend.create_in_mongo(self.datasource, docs, **kwargs)
        self.on_created(docs)
        return ids

    def patch_in_mongo(self, id, document, original):
        res = self.backend.update_in_mongo(self.datasource, id, document, original)
        return res

    def on_fetched(self, docs):
        for doc in docs['_items']:
            self._enhance_event_item(doc)

    def on_fetched_item(self, doc):
        self._enhance_event_item(doc)

    @staticmethod
    def get_plannings_for_event(event):
        return get_resource_service('planning').find(where={
            'event_item': event[config.ID_FIELD]
        })

    def _enhance_event_item(self, doc):
        plannings = self.get_plannings_for_event(doc)

        if plannings.count() > 0:
            doc['planning_ids'] = [planning.get('_id') for planning in plannings]

        for location in (doc.get('location') or []):
            format_address(location)

        # Ensure the _type is set so the UI can differentiate between object types
        doc['_type'] = 'events'

    @staticmethod
    def has_planning_items(doc):
        return EventsService.get_plannings_for_event(doc).count() > 0

    def get_all_items_in_relationship(self, item):
        # Get recurring items
        if item.get('recurrence_id'):
            all_items = self.find(where={'recurrence_id': item.get('recurrence_id')})
            # Now, get associated planning items with the same recurrence
            return itertools.chain(all_items, get_resource_service('planning').find(
                where={'recurrence_id': item.get('recurrence_id')}))
        else:
            # Get associated planning items
            return self.get_plannings_for_event(item)

    def on_locked_event(self, doc, user_id):
        self._enhance_event_item(doc)

    @staticmethod
    def set_ingest_provider_sequence(item, provider):
        """Sets the value of ingest_provider_sequence in item.

        :param item: object to which ingest_provider_sequence to be set
        :param provider: ingest_provider object, used to build the key name of sequence
        """
        sequence_number = get_resource_service('sequences').get_next_sequence_number(
            key_name='ingest_providers_{_id}'.format(_id=provider[config.ID_FIELD]),
            max_seq_number=app.config['MAX_VALUE_OF_INGEST_SEQUENCE']
        )
        item['ingest_provider_sequence'] = str(sequence_number)

    def on_create(self, docs):
        # events generated by recurring rules
        generated_events = []
        for event in docs:
            # generates an unique id
            if 'guid' not in event:
                event['guid'] = generate_guid(type=GUID_NEWSML)
            event['_id'] = event['guid']
            # set the author
            set_original_creator(event)

            # overwrite expiry date
            overwrite_event_expiry_date(event)

            # We ignore the 'update_method' on create
            if 'update_method' in event:
                del event['update_method']

            set_planning_schedule(event)

            # generates events based on recurring rules
            if event['dates'].get('recurring_rule', None):
                generated_events.extend(generate_recurring_events(event))
                # remove the event that contains the recurring rule. We don't need it anymore
                docs.remove(event)

            if event['state'] == 'ingested':
                events_history = get_resource_service('events_history')
                events_history.on_item_created([event])

        if generated_events:
            docs.extend(generated_events)

    def on_created(self, docs):
        """Send WebSocket Notifications for created Events

        Generate the list of IDs for recurring and non-recurring events
        Then send this list off to the clients so they can fetch these events
        """
        notifications_sent = []

        for doc in docs:
            event_type = 'events:created'
            event_id = str(doc.get(config.ID_FIELD))
            user_id = str(doc.get('original_creator', ''))

            # Ensure the _type is set so the UI can differentiate between object types
            doc['_type'] = 'events'

            if doc.get('recurrence_id'):
                event_type = 'events:created:recurring'
                event_id = str(doc['recurrence_id'])

            # Don't send notification if one has already been sent
            # This is to ensure recurring events doesn't send multiple notifications
            if event_id in notifications_sent or 'previous_recurrence_id' in doc:
                continue

            notifications_sent.append(event_id)
            push_notification(
                event_type,
                item=event_id,
                user=user_id
            )

    @staticmethod
    def can_edit(item, user_id):
        # Check privileges
        if not current_user_has_privilege('planning_event_management'):
            return False, 'User does not have sufficient permissions.'
        return True, ''

    def update(self, id, updates, original):
        item = self.backend.update(self.datasource, id, updates, original)
        return item

    def publish(self, resource, id, updates, original):
        pass

    def on_update(self, updates, original):
        """Update single or series of recurring events.

        Determine if the supplied event is a single event or a
        series of recurring events, and call the appropriate method
        for the event type.
        """
        if 'skip_on_update' in updates:
            # this is a recursive update (see below)
            del updates['skip_on_update']
            return

        update_method = updates.pop('update_method', UPDATE_SINGLE)

        user = get_user()
        user_id = user.get(config.ID_FIELD) if user else None

        if user_id:
            updates['version_creator'] = user_id

        lock_user = original.get('lock_user', None)
        str_user_id = str(user.get(config.ID_FIELD)) if user_id else None

        if lock_user and str(lock_user) != str_user_id:
            raise SuperdeskApiError.forbiddenError('The item was locked by another user')

        # Run the specific methods based on if the original is a
        # single or a series of recurring events
        if not original.get('dates', {}).get('recurring_rule', None) or update_method == UPDATE_SINGLE:
            self._update_single_event(updates, original)
        else:
            self._update_recurring_events(updates, original, update_method)

    def on_updated(self, updates, original):
        if original.get('lock_user') and 'lock_user' in updates and updates.get('lock_user') is None:
            # when the event is unlocked by the patch.
            push_notification(
                'events:unlock',
                item=str(original.get(config.ID_FIELD)),
                user=str(get_user_id()), lock_session=str(get_auth().get('_id')),
                etag=updates['_etag']
            )

        if not updates.get('duplicate_to'):
            update_published_item(updates, original)

    def _update_single_event(self, updates, original):
        """Updates the metadata of a single event.

        If recurring_rule is provided, we convert this single event into
        a series of recurring events, otherwise we simply update this event.
        """

        # Determine if we're to convert this single event to a recurring series of events
        if updates.get('dates', {}).get('recurring_rule', None) is not None:
            generated_events = self._convert_to_recurring_event(updates, original)

            push_notification(
                'events:updated:recurring',
                item=str(original[config.ID_FIELD]),
                user=str(updates.get('version_creator', '')),
                recurrence_id=str(generated_events[0]['recurrence_id'])
            )
        else:
            # This updates Event metadata only
            push_notification(
                'events:updated',
                item=str(original[config.ID_FIELD]),
                user=str(updates.get('version_creator', ''))
            )

    def _update_recurring_events(self, updates, original, update_method):
        """Method to update recurring events.

        If the recurring_rule has been removed for this event, process
        it separately, otherwise update the event and/or its recurring rules
        """
        # This method now only handles updating of Event metadata
        # So make sure to remove any date information that might be in
        # the updates
        updates.pop('dates', None)

        if update_method == UPDATE_FUTURE:
            historic, past, future = self.get_recurring_timeline(original)
            events = future
        else:
            historic, past, future = self.get_recurring_timeline(original)
            events = historic + past + future

        for e in events:
            new_updates = deepcopy(updates)
            new_updates['skip_on_update'] = True
            self.patch(e[config.ID_FIELD], new_updates)
            app.on_updated_events(new_updates, {'_id': e[config.ID_FIELD]})

        # And finally push a notification to connected clients
        push_notification(
            'events:updated:recurring',
            item=str(original[config.ID_FIELD]),
            recurrence_id=str(original['recurrence_id']),
            user=str(updates.get('version_creator', ''))
        )

    def _convert_to_recurring_event(self, updates, original):
        """Convert a single event to a series of recurring events"""

        updates['recurrence_id'] = generate_guid(type=GUID_NEWSML)

        merged = copy.deepcopy(original)
        merged.update(updates)

        # Generated new events will be "draft"
        merged[ITEM_STATE] = WORKFLOW_STATE.DRAFT

        generated_events = generate_recurring_events(merged)
        updated_event = generated_events.pop(0)

        # Check to see if the first generated event is different from original
        # If yes, mark original as rescheduled with generated recurrence_id
        if updated_event['dates']['start'].date() != original['dates']['start'].date():
            # Reschedule original event
            updates['update_method'] = UPDATE_SINGLE
            event_reschedule_service = get_resource_service('events_reschedule')
            updates['dates'] = updated_event['dates']
            set_planning_schedule(updates)
            event_reschedule_service.update_single_event(updates, original)
            if updates.get('state') == WORKFLOW_STATE.RESCHEDULED:
                history_service = get_resource_service('events_history')
                history_service.on_reschedule(updates, original)
        else:
            # Original event falls as a part of the series
            # Remove the first element in the list (the current event being updated)
            # And update the start/end dates to be in line with the new recurring rules
            updates['dates']['start'] = updated_event['dates']['start']
            updates['dates']['end'] = updated_event['dates']['end']
            set_planning_schedule(updates)
            remove_lock_information(item=updates)

        # Create the new events and generate their history
        self.create(generated_events)
        app.on_inserted_events(generated_events)
        return generated_events

    def get_recurring_timeline(self, selected):
        events_base_service = EventsBaseService('events', backend=superdesk.get_backend())
        return events_base_service.get_recurring_timeline(selected, postponed=True)


class EventsResource(superdesk.Resource):
    """Resource for events data model

    See IPTC-G2-Implementation_Guide (version 2.21) Section 15.4 for schema details
    """

    url = 'events'
    schema = events_schema
    item_url = 'regex("[\w,.:-]+")'
    resource_methods = ['GET', 'POST']
    datasource = {
        'source': 'events',
        'search_backend': 'elastic',
        'default_sort': [('dates.start', 1)],
    }
    item_methods = ['GET', 'PATCH', 'PUT']
    public_methods = ['GET']
    privileges = {'POST': 'planning_event_management',
                  'PATCH': 'planning_event_management'}


def generate_recurring_dates(start, frequency, interval=1, endRepeatMode='count',
                             until=None, byday=None, count=5, tz=None, date_only=False):
    """

    Returns list of dates related to recurring rules

    :param start datetime: date when to start
    :param frequency str: DAILY, WEEKLY, MONTHLY, YEARLY
    :param interval int: indicates how often the rule repeats as a positive integer
    :param until datetime: date after which the recurrence rule expires
    :param byday str or list: "MO TU"
    :param count int: number of occurrences of the rule
    :return list: list of datetime

    """
    # if tz is given, respect the timzone by starting from the local time
    # NOTE: rrule uses only naive datetime
    if tz:
        try:
            # start can already be localized
            start = pytz.UTC.localize(start)
        except ValueError:
            pass
        start = start.astimezone(tz).replace(tzinfo=None)
        if until:
            until = until.astimezone(tz).replace(tzinfo=None)

    if frequency == 'DAILY':
        byday = None

    # check format of the recurring_rule byday value
    if byday and re.match(r'^-?[1-5]+.*', byday):
        # byday uses monthly or yearly frequency rule with day of week and
        # preceeding day of month intenger byday value
        # examples:
        # 1FR - first friday of the month
        # -2MON - second to last monday of the month
        if byday[:1] == '-':
            day_of_month = int(byday[:2])
            day_of_week = byday[2:]
        else:
            day_of_month = int(byday[:1])
            day_of_week = byday[1:]

        byweekday = DAYS.get(day_of_week)(day_of_month)
    else:
        # byday uses DAYS constants
        byweekday = byday and [DAYS.get(d) for d in byday.split()] or None
    # TODO: use dateutil.rrule.rruleset to incude ex_date and ex_rule
    dates = rrule(
        FREQUENCIES.get(frequency),
        dtstart=start,
        until=until,
        byweekday=byweekday,
        count=count,
        interval=interval,
    )
    # if a timezone has been applied, returns UTC
    if tz:
        if date_only:
            return (tz.localize(dt).astimezone(pytz.UTC).replace(tzinfo=None).date() for dt in dates)
        else:
            return (tz.localize(dt).astimezone(pytz.UTC).replace(tzinfo=None) for dt in dates)
    else:
        if date_only:
            return (date.date() for date in dates)
        else:
            return (date for date in dates)


def setRecurringMode(event):
    endRepeatMode = event.get('dates', {}).get('recurring_rule', {}).get('endRepeatMode')
    if endRepeatMode == 'count':
        event['dates']['recurring_rule']['until'] = None
    elif endRepeatMode == 'until':
        event['dates']['recurring_rule']['count'] = None


def overwrite_event_expiry_date(event):
    if 'expiry' in event:
        event['expiry'] = event['dates']['end']


def generate_recurring_events(event):
    generated_events = []
    setRecurringMode(event)

    # Get the recurrence_id, or generate one if it doesn't exist
    recurrence_id = event.get('recurrence_id', generate_guid(type=GUID_NEWSML))

    # compute the difference between start and end in the original event
    time_delta = event['dates']['end'] - event['dates']['start']
    # for all the dates based on the recurring rules:
    for date in itertools.islice(generate_recurring_dates(
            start=event['dates']['start'],
            tz=event['dates'].get('tz') and pytz.timezone(event['dates']['tz'] or None),
            **event['dates']['recurring_rule']
    ), 0, get_max_recurrent_events()):  # set a limit to prevent too many events to be created
        # create event with the new dates
        new_event = copy.deepcopy(event)

        # Remove fields not required by the new events
        for key in list(new_event.keys()):
            if key.startswith('_'):
                new_event.pop(key)
            elif key.startswith('lock_'):
                new_event.pop(key)
        new_event.pop('pubstatus', None)

        new_event['dates']['start'] = date
        new_event['dates']['end'] = date + time_delta
        # set a unique guid
        new_event['guid'] = generate_guid(type=GUID_NEWSML)
        new_event['_id'] = new_event['guid']
        # set the recurrence id
        new_event['recurrence_id'] = recurrence_id

        # set expiry date
        overwrite_event_expiry_date(new_event)
        # the _planning_schedule
        set_planning_schedule(new_event)
        generated_events.append(new_event)

    return generated_events


def set_planning_schedule(event):
    if event and event.get('dates') and event['dates'].get('start'):
        event['_planning_schedule'] = [
            {'scheduled': event['dates']['start']}
        ]
