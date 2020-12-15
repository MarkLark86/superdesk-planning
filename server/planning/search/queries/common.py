# -*- coding: utf-8; -*-
#
# This file is part of Superdesk.
#
#  Copyright 2020 Sourcefabric z.u. and contributors.
#
# For the full copyright and license information, please see the
# AUTHORS and LICENSE files distributed with this source code, or
# at https://www.sourcefabric.org/superdesk/license

from typing import Dict, Any, Optional

from flask import current_app as app
from eve.utils import str_to_date

from superdesk.utc import get_timezone_offset, utcnow
from superdesk.errors import SuperdeskApiError
from superdesk.default_settings import strtobool
from planning.search.queries import elastic
from planning.common import POST_STATE, WORKFLOW_STATE


def get_time_zone(params: Dict[str, Any]):
    return params.get('tz_offset') or get_timezone_offset(app.config['DEFAULT_TIMEZONE'], utcnow())


def get_date_params(params: Dict[str, Any]):
    date_filter = (params.get('date_filter') or '').strip().lower()
    tz_offset = get_time_zone(params)

    try:
        start_date = params.get('start_date')
        if start_date:
            str_to_date(params['start_date'])  # validating if date can be parsed
    except Exception:
        raise SuperdeskApiError.badRequestError('Invalid value for start date')

    try:
        end_date = params.get('end_date')
        if end_date:
            str_to_date(params['end_date'])  # validating if date can be parsed
    except Exception:
        raise SuperdeskApiError.badRequestError('Invalid value for end date')

    return date_filter, start_date, end_date, tz_offset


def str_to_array(arg: Optional[str] = None):
    if len(arg or ''):
        return arg.split(',')

    return []


def search_item_ids(params: Dict[str, Any], query: elastic.ElasticQuery):
    ids = str_to_array(params.get('item_ids'))
    if len(ids):
        query.must.append(
            elastic.terms(
                field='_id',
                values=ids
            )
        )


def search_name(params: Dict[str, Any], query: elastic.ElasticQuery):
    if len(params.get('name') or ''):
        query.must.append(
            elastic.query_string(
                text=params['name'],
                field='name',
                default_operator='AND'
            )
        )


def search_full_text(params: Dict[str, Any], query: elastic.ElasticQuery):
    if len(params.get('full_text') or ''):
        query.must.append(
            elastic.query_string(
                text=params['full_text'],
                lenient=True,
                default_operator='AND'
            )
        )


def search_anpa_category(params: Dict[str, Any], query: elastic.ElasticQuery):
    categories = str_to_array(params.get('anpa_category'))

    if len(categories):
        query.must.append(
            elastic.terms(
                field='anpa_category.qcode',
                values=categories
            )
        )


def search_subject(params: Dict[str, Any], query: elastic.ElasticQuery):
    subjects = str_to_array(params.get('subject'))

    if len(subjects):
        query.must.append(
            elastic.terms(
                field='subject.qcode',
                values=subjects
            )
        )


def search_posted(params: Dict[str, Any], query: elastic.ElasticQuery):
    if strtobool(params.get('posted') or ''):
        query.must.append(
            elastic.term(
                field='pubstatus',
                value=POST_STATE.USABLE
            )
        )


def search_place(params: Dict[str, Any], query: elastic.ElasticQuery):
    places = str_to_array(params.get('place'))

    if len(places):
        query.must.append(
            elastic.terms(
                field='place.qcode',
                values=places
            )
        )


def search_language(params: Dict[str, Any], query: elastic.ElasticQuery):
    if len(params.get('language') or ''):
        query.must.append(
            elastic.terms(
                field='language',
                values=params['language']
            )
        )


def search_locked(params: Dict[str, Any], query: elastic.ElasticQuery):
    if len(params.get('lock_state') or ''):
        if params['lock_state'] == 'locked':
            query.must.append(
                elastic.field_exists('lock_session')
            )
        elif params['lock_state'] == 'unlocked':
            query.must_not.append(
                elastic.field_exists('lock_session')
            )


def search_recurrence_id(params: Dict[str, Any], query: elastic.ElasticQuery):
    if len(params.get('recurrence_id') or ''):
        query.must.append(
            elastic.term(
                field='recurrence_id',
                value=params['recurrence_id']
            )
        )


def append_states_query_for_advanced_search(params: Dict[str, Any], query: elastic.ElasticQuery):
    spike_state = params.get('spike_state')
    states = str_to_array(params.get('state'))

    if spike_state == WORKFLOW_STATE.DRAFT:
        query.must_not.append(
            elastic.term(
                field='state',
                value=WORKFLOW_STATE.SPIKED
            )
        )
    elif spike_state == WORKFLOW_STATE.SPIKED:
        query.must.append(
            elastic.term(
                field='state',
                value=WORKFLOW_STATE.SPIKED
            )
        )
    elif len(states):
        # Push spiked state only if other states are selected
        # Else, it will be fetched anyway
        states.append(WORKFLOW_STATE.SPIKED)

    if spike_state != WORKFLOW_STATE.SPIKED and len(states):
        query.must.append(
            elastic.terms(
                field='state',
                values=states
            )
        )

    if not strtobool(params.get('include_killed') or '') and WORKFLOW_STATE.KILLED not in states:
        query.must_not.append(
            elastic.term(
                field='state',
                value=WORKFLOW_STATE.KILLED
            )
        )


COMMON_SEARCH_FILTERS = [
    search_item_ids,
    search_name,
    search_full_text,
    search_anpa_category,
    search_subject,
    search_posted,
    search_place,
    search_language,
    search_locked,
    search_recurrence_id,
    append_states_query_for_advanced_search,
]


COMMON_PARAMS = [
    'item_ids',
    'name',
    'tz_offset',
    'full_text',
    'anpa_category',
    'subject',
    'posted',
    'place',
    'language',
    'state',
    'spike_state',
    'include_killed',
    'date_filter',
    'start_date',
    'end_date',
    'start_of_week',
    'slugline',
    'lock_state',
    'recurrence_id',
    'repo',
    'max_results',
    'page'
]
