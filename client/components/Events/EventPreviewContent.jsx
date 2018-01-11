import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {gettext, getCreator} from '../../utils';
import * as selectors from '../../selectors';
import {get} from 'lodash';
import {Row} from '../UI/Preview';
import {
    AuditInformation,
    RelatedPlannings,
    StateLabel
} from '../index';
import {EventScheduleSummary} from './';
import {ToggleBox} from '../UI';
import {ContentBlock} from '../UI/SidePanel';
import {LinkInput, FileInput} from '../UI/Form';
import {ContactInfoContainer} from '../index';

export class EventPreviewContentComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showContactInfo: false,
            currentContact: [],
        };
        this.viewContactDetails = this.viewContactDetails.bind(this);
        this.closeDetails = this.closeDetails.bind(this);
    }

    viewContactDetails(contact) {
        this.setState({
            showContactInfo: true,
            currentContact: contact,
        });
    }

    closeDetails() {
        this.setState({
            showContactInfo: false
        });
    }

    render() {
        const {item, users, formProfile, timeFormat, dateFormat, createUploadLink} = this.props;
        const createdBy = getCreator(item, 'original_creator', users);
        const updatedBy = getCreator(item, 'version_creator', users);
        const creationDate = get(item, '_created');
        const updatedDate = get(item, '_updated');
        const versionCreator = get(updatedBy, 'display_name') ? updatedBy :
            users.find((user) => user._id === updatedBy);

        const calendarsText = get(item, 'calendars.length', 0) === 0 ? '' :
            item.calendars.map((c) => c.name).join(', ');
        const categoryText = get(item, 'anpa_category.length', 0) === 0 ? '' :
            item.anpa_category.map((c) => c.name).join(', ');
        const subjectText = get(item, 'subject.length', 0) === 0 ? '' :
            item.subject.map((s) => s.name).join(', ');

        /** Contact Field related */
        const avatarClass = (contact) => contact.first_name ? 'avatar' : 'avatar organisation';
        const displayContact = (contact) => (contact.first_name ?
            `${contact.first_name} ${contact.last_name}` : contact.organisation);
        const displayContactInfo = (contact) => (contact.first_name && contact.job_title && contact.organisation &&
                    <h5>{contact.job_title}, {contact.organisation}</h5>);

        const displayContactList = (contact) => (<span className="contact-info">
            <figure className={avatarClass(contact)} />
            <span>{displayContact(contact)} {displayContactInfo(contact)}</span>
            <button className="btn-view-details" data-sd-tooltip="View Details" data-flow="left"
                onClick={this.viewContactDetails.bind(this, contact)}>
                <i className="icon-external" />
            </button>
        </span>);

        return (
            <ContentBlock>
                <div className="side-panel__content-block--flex">
                    <div className="side-panel__content-block-inner side-panel__content-block-inner--grow">
                        <AuditInformation
                            createdBy={createdBy}
                            updatedBy={versionCreator}
                            createdAt={creationDate}
                            updatedAt={updatedDate}
                        />
                    </div>
                    <div className="side-panel__content-block-inner side-panel__content-block-inner--right">
                        <StateLabel item={item} verbose={true}/>
                    </div>
                </div>
                {get(formProfile, 'editor.slugline.enabled') && <Row
                    label={gettext('Slugline')}
                    value={item.slugline || ''}
                    className="slugline"
                />}
                {get(formProfile, 'editor.name.enabled') && <Row
                    label={gettext('Name')}
                    value={item.name || ''}
                    className="strong"
                />}
                {get(formProfile, 'editor.definition_short.enabled') && <Row
                    label={gettext('Description')}
                    value={item.definition_short || ''}
                />}
                {get(formProfile, 'editor.occur_status.enabled') && <Row
                    label={gettext('Occurance Status')}
                    value={get(item, 'occur_status.name', '')}
                />}
                <EventScheduleSummary schedule={item.dates} timeFormat={timeFormat} dateFormat={dateFormat}/>
                {get(formProfile, 'editor.location.enabled') &&
                    get(item, 'location.length') > 0 &&
                    <Row label={gettext('Location')}>
                        <div>{item.location[0].name}</div>
                        <div>{item.location[0].formatted_address}</div>
                    </Row>}

                {get(formProfile, 'editor.contacts.enabled') && get(item, '_contacts.length') > 0 &&
                    <Row label={gettext('Contact')}>
                        {get(item, '_contacts', []).map((contact, index) => (
                            <span key={index}>
                                {displayContactList(contact)}
                            </span>
                        ))}
                        {this.state.showContactInfo && (
                            <ContactInfoContainer onCancel={this.closeDetails.bind(this)}
                                target="icon-external" currentContact={this.state.currentContact} />
                        )
                        }
                    </Row>
                }

                <ToggleBox title={gettext('Details')} isOpen={false}>
                    {get(formProfile, 'editor.calendars.enabled') && <Row
                        label={gettext('Calendars')}
                        value={calendarsText}
                    />}
                    {get(formProfile, 'editor.anpa_category.enabled') && <Row
                        label={gettext('Category')}
                        value={categoryText}
                    />}
                    {get(formProfile, 'editor.subject.enabled') && <Row
                        label={gettext('Subject')}
                        value={subjectText}
                    />}
                    {get(formProfile, 'editor.definition_long.enabled') && <Row
                        label={gettext('Long Description')}
                        value={item.definition_long || ''}
                    />}
                    {get(formProfile, 'editor.internal_note.enabled') && <Row
                        label={gettext('Internal Note')}
                        value={item.internal_note || ''}
                    />}
                </ToggleBox>
                {get(formProfile, 'editor.files.enabled') &&
                    <ToggleBox title={gettext('Attached Files')} isOpen={false}>
                        {get(item, 'files.length') > 0 ?
                            <ul>
                                {get(item, 'files', []).map((file, index) => (
                                    <li key={index}>
                                        <FileInput
                                            value={file}
                                            createLink={createUploadLink}
                                            readOnly={true} />
                                    </li>
                                ))}
                            </ul> :
                            <span className="sd-text__info">{gettext('No attached files added.')}</span>}
                    </ToggleBox>
                }
                {get(formProfile, 'editor.links.enabled') &&
                    <ToggleBox title={gettext('External Links')} isOpen={false}>
                        {get(item, 'links.length') > 0 ?
                            <ul>
                                {get(item, 'links', []).map((link, index) => (
                                    <li key={index}>
                                        <LinkInput value={link} readOnly={true} />
                                    </li>
                                ))}
                            </ul> :
                            <span className="sd-text__info">{gettext('No external links added.')}</span>}
                    </ToggleBox>
                }
                <ToggleBox title={gettext('Related Planning Items')} isOpen={false}>
                    {get(item, '_plannings.length') > 0 ?
                        <RelatedPlannings plannings={item._plannings}
                            openPlanningItem={true}/> :
                        <span className="sd-text__info">{gettext('No related planning items.')}</span>}
                </ToggleBox>
            </ContentBlock>
        );
    }
}

EventPreviewContentComponent.propTypes = {
    item: PropTypes.object,
    users: PropTypes.array,
    session: PropTypes.object,
    lockedItems: PropTypes.object,
    formProfile: PropTypes.object,
    timeFormat: PropTypes.string,
    dateFormat: PropTypes.string,
    createUploadLink: PropTypes.func,
};

const mapStateToProps = (state, ownProps) => ({
    item: selectors.events.eventWithRelatedDetails(state),
    session: selectors.getSessionDetails(state),
    privileges: selectors.getPrivileges(state),
    users: selectors.getUsers(state),
    lockedItems: selectors.locks.getLockedItems(state),
    timeFormat: selectors.config.getTimeFormat(state),
    dateFormat: selectors.config.getDateFormat(state),
    formProfile: selectors.forms.eventProfile(state),
    createUploadLink: (f) => selectors.config.getServerUrl(state) + '/upload/' + f.filemeta.media_id + '/raw',
});

export const EventPreviewContent = connect(mapStateToProps, null)(EventPreviewContentComponent);
