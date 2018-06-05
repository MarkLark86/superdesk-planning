import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {get, isEqual, cloneDeep, omit, pickBy, throttle} from 'lodash';

import {
    gettext,
    lockUtils,
    eventUtils,
    planningUtils,
    updateFormValues,
    isExistingItem,
    isItemKilled,
    isTemporaryId,
    getItemId,
    getItemType,
} from '../../../utils';
import {EventUpdateMethods} from '../../Events';

import {ITEM_TYPE, EVENTS, PLANNING, POST_STATE, WORKFLOW_STATE, COVERAGES, AUTOSAVE} from '../../../constants';

import {Tabs as NavTabs} from '../../UI/Nav';
import {SidePanel, Content} from '../../UI/SidePanel';

import {EditorHeader, EditorContentTab} from './index';
import {HistoryTab} from '../index';
// import {Autosave} from '../../index';
import Autosave from './Autosave';

export class EditorComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            tab: 0,
            diff: {},
            errors: {},
            errorMessages: [],
            dirty: false,
            submitting: false,
            submitFailed: false,
            partialSave: false,
            itemReady: false,
        };

        this.tearDownRequired = false;
        this.editorHeaderComponent = null;
        this.onChangeHandler = this.onChangeHandler.bind(this);
        this.setActiveTab = this.setActiveTab.bind(this);
        this.onSave = this.onSave.bind(this);
        this.onPost = this.onPost.bind(this);
        this.onSaveAndPost = this.onSaveAndPost.bind(this);
        this.onUnpost = this.onUnpost.bind(this);
        this.onSaveUnpost = this.onSaveUnpost.bind(this);
        this.onCancel = this.onCancel.bind(this);
        this.resetForm = this.resetForm.bind(this);
        this.createNew = this.createNew.bind(this);
        this.onAddCoverage = this.onAddCoverage.bind(this);
        this.startPartialSave = this.startPartialSave.bind(this);
        this.onMinimized = this.onMinimized.bind(this);
        this.flushAutosave = this.flushAutosave.bind(this);
        this.cancelFromHeader = this.cancelFromHeader.bind(this);

        this.autosave = new Autosave(
            this.onChangeHandler,
            AUTOSAVE.INTERVAL,
            props.saveAutosave,
            props.loadAutosave
        );

        // this.saveAutosave = this.saveAutosave.bind(this);
        // this._saveAutosave = this.saveAutosave.bind(this);
        // this.loadAutosave = this.loadAutosave.bind(this);
        // this.throttledSave = null;

        this.tabs = [
            {label: gettext('Content'), render: EditorContentTab, enabled: true},
            {label: gettext('History'), render: HistoryTab, enabled: true},
        ];

        if (this.props.addNewsItemToPlanning) {
            this.tearDownRequired = true;
        }

        this.dom = {autosave: null};
    }

    componentDidMount() {
        // If the editor is in main page and the item is located in the URL, on first mount copy the diff from the item.
        // Otherwise all item changes will occur during the componentWillReceiveProps
        if (!this.props.inModalView && this.props.itemId && this.props.itemType) {
            this.loadItem(this.props.itemId, this.props.itemType);
        }

        if (this.props.inModalView) {
            // Moved from editor on main document to modal mode
            this.resetForm(this.props.item);
        }
    }

    componentWillUnmount() {
        if (!this.tearDownRequired) {
            // problem of modal within modal, so setting this before unmount
            this.tearDownEditorState();
        }
    }

    loadItem(itemId, itemType) {
        this.setState({itemReady: false}, () => {
            this.props.loadItem(itemId, itemType)
                .then(() => this.autosave.load(itemType, itemId))
                .then(() => this.setState({itemReady: true}));
        });

        // if (isTemporaryId(itemId)) {
        //     this.setState({itemReady: false})
        //     this.setState({itemReady: true});
        // } else {
        //     this.setState({itemRead: false}, () => {
        //         this.props.loadItem(itemId, itemType)
        //             .then(() => this.autosave.load(itemType, itemId))
        //             .then(() => this.setState({itemReady: true}));
        //     });
        // }
    }

    resetForm(item = null, dirty = false, loadItem = false) {
        this.setState({
            diff: item === null ? {} : cloneDeep(item),
            dirty: dirty,
            submitting: false,
            errors: {},
            errorMessages: [],
            itemReady: true,
        }, () => {
            const itemId = getItemId(item);
            const itemType = getItemType(item);

            if (loadItem && itemId && itemType) {
                this.loadItem(itemId, itemType);
            }
        });

        this.tabs[0].label = get(item, 'type') === ITEM_TYPE.EVENT ?
            gettext('Event Details') :
            gettext('Planning Details');
    }

    createNew(props) {
        // const itemId = getItemId(props.initialValues);

        if (props.itemType === ITEM_TYPE.EVENT || props.itemType === ITEM_TYPE.PLANNING) {
            this.resetForm(props.initialValues, isExistingItem(props.initialValues), true);
        } else {
            this.resetForm();
        }

        // if (props.itemType === ITEM_TYPE.EVENT) {
        //
        //     if (get(props, 'initialValues._newItem')) {
        //         this.resetForm(props.initialValues, false)
        //     }
        //
        //     if (isEqual(omit(props.initialValues, '_id'), {type: ITEM_TYPE.EVENT})) {
        //         this.resetForm({
        //             ...EVENTS.DEFAULT_VALUE(props.occurStatuses),
        //             _id: itemId,
        //         });
        //     } else {
        //         this.resetForm(props.initialValues, true);
        //     }
        // } else if (props.itemType === ITEM_TYPE.PLANNING) {
        //     if (isEqual(omit(props.initialValues, '_id'), {type: ITEM_TYPE.PLANNING})) {
        //         this.resetForm({
        //             ...PLANNING.DEFAULT_VALUE(),
        //             _id: itemId,
        //         });
        //     } else {
        //         this.resetForm(props.initialValues, true);
        //     }
        // } else {
        //     this.resetForm();
        // }
    }

    onItemIDChanged(nextProps) {
        this.setState({itemReady: false}, () => {
            if (isTemporaryId(nextProps.itemId)) {
                // This happens when the editor is opened on an existing item and
                // the user attempts to create a new item
                this.createNew(nextProps);
            } else if (nextProps.item === null) {
                // This happens when the items have changed
                this.loadItem(nextProps.itemId, nextProps.itemType);
            } else {
                this.resetForm(nextProps.item);
            }
        });
    }

    // This happens when the Editor has finished loading an existing item or creating a duplicate
    onFinishLoading(nextProps) {
        this.resetForm(
            nextProps.item,
            !isExistingItem(nextProps.item) && nextProps.item.duplicate_from
        );
    }

    onItemChanged(nextProps) {
        this.setState({itemReady: false}, () => {
            // This happens when the item attributes have changed
            if (this.state.partialSave) {
                this.finalisePartialSave(nextProps);
            } else {
                this.resetForm(get(nextProps, 'item') || {});
            }
        });
    }

    componentWillReceiveProps(nextProps) {
        if (!nextProps.itemType || !nextProps.itemId) {
            // If the editor has been closed, then set the itemReady state to false
            this.setState({itemReady: false});
        } else if (nextProps.item !== null && this.props.item === null) {
            // This happens when the Editor has finished loading an existing item or creating a duplicate
            this.onFinishLoading(nextProps);
        } else if (nextProps.itemId !== this.props.itemId) {
            // If the item ID has changed
            this.onItemIDChanged(nextProps);
        } else if (!this.itemsEqual(get(nextProps, 'item'), get(this.props, 'item'))) {
            // This happens when the item attributes have changed
            this.onItemChanged(nextProps);
        }

        this.tabs[1].enabled = !!nextProps.itemId;
    }

    itemsEqual(nextItem, currentItem) {
        const pickField = (value, key) => (
            !key.startsWith('_') &&
            !key.startsWith('lock_') &&
            value !== null &&
            value !== undefined
        );

        return isEqual(
            pickBy(nextItem, pickField),
            pickBy(currentItem, pickField)
        );
    }

    onChangeHandler(field, value, updateDirtyFlag = true, saveAutosave = true) {
        // If field (name) is passed, it will replace that field
        // Else, entire object will be replaced
        const diff = field ? Object.assign({}, this.state.diff) : cloneDeep(value);
        const errors = cloneDeep(this.state.errors);
        const errorMessages = [];

        if (field) {
            updateFormValues(diff, field, value);
        }

        this.props.onValidate(
            this.props.itemType,
            diff,
            this.props.formProfiles,
            errors,
            errorMessages
        );

        const newState = {diff, errors, errorMessages};

        if (updateDirtyFlag) {
            newState.dirty = !this.itemsEqual(diff, this.props.item);
        }

        this.setState(newState);

        if (this.props.onChange) {
            this.props.onChange(diff);
        }

        if (saveAutosave) {
            this.autosave.save(diff);
        }
    }

    _save({post, unpost, withConfirmation, updateMethod}) {
        if (!isEqual(this.state.errors, {})) {
            this.setState({
                submitFailed: true,
            });
            this.props.notifyValidationErrors(this.state.errorMessages);
        } else {
            this.setState({
                submitting: true,
                submitFailed: false,
            });

            // If we are posting or unposting, we are setting 'pubstatus' to 'usable' from client side
            let itemToUpdate = cloneDeep(this.state.diff);

            if (post) {
                itemToUpdate.state = WORKFLOW_STATE.SCHEDULED;
                itemToUpdate.pubstatus = POST_STATE.USABLE;
            } else if (unpost) {
                itemToUpdate.state = WORKFLOW_STATE.KILLED;
                itemToUpdate.pubstatus = POST_STATE.CANCELLED;
            }

            if (this.props.itemType === ITEM_TYPE.EVENT) {
                itemToUpdate.update_method = updateMethod;
            }

            return this.props.onSave(itemToUpdate, withConfirmation)
                .then(
                    () => this.setState({
                        submitting: false,
                        dirty: false,
                    }),
                    () => this.setState({submitting: false}));
        }
    }

    /**
     * Initiate a partial save sequence
     * This will perform validation on the data provided, then set the submit flags
     * @param {object} updates - The updated item, with partial updates applied to the initialValues
     * @return {boolean} Returns true if there are no validation errors, false otherwise
     */
    startPartialSave(updates) {
        const errors = {};
        const errorMessages = [];

        this.props.onValidate(
            this.props.itemType,
            updates,
            this.props.formProfiles,
            errors,
            errorMessages
        );

        if (isEqual(errors, {})) {
            this.setState({
                partialSave: true,
                submitting: true,
                submitFailed: false,
            });

            return true;
        }

        this.setState({submitFailed: true});
        this.props.notifyValidationErrors(errorMessages);

        return false;
    }

    /**
     * Restore the states after a partial save is completed (once the original item has been updated)
     * The dirty flag will be recalculated if there are other fields there are still not saved
     * @param {object} nextProps - The nextProps as passed in to componentWillReceiveProps
     */
    finalisePartialSave(nextProps) {
        this.setState({
            partialSave: false,
            submitting: false,
            dirty: !this.itemsEqual(nextProps.item, this.state.diff),
            itemReady: true,
        });
    }

    onSave(withConfirmation = true, updateMethod = EventUpdateMethods[0]) {
        return this._save({post: false, unpost: false, withConfirmation: withConfirmation, updateMethod: updateMethod});
    }

    onPost() {
        this.setState({
            submitting: true,
            submitFailed: false,
        });

        return this.props.onPost(this.state.diff)
            .then(
                () => this.setState({
                    submitting: false,
                    dirty: false,
                }),
                () => this.setState({submitting: false})
            );
    }

    onSaveAndPost(withConfirmation = true, updateMethod = EventUpdateMethods[0]) {
        return this._save({
            post: true,
            unpost: false,
            withConfirmation: withConfirmation,
            updateMethod: updateMethod,
        });
    }

    onUnpost() {
        this.setState({
            submitting: true,
            submitFailed: false,
        });

        return this.props.onUnpost(this.state.diff)
            .then(
                () => this.setState({
                    submitting: false,
                    dirty: false,
                }),
                () => this.setState({submitting: false})
            );
    }

    onSaveUnpost() {
        return this._save({post: false, unpost: true});
    }

    onAddCoverage(g2ContentType) {
        const {newsCoverageStatus, item} = this.props;
        const newCoverage = COVERAGES.DEFAULT_VALUE(newsCoverageStatus, item, g2ContentType);

        this.onChangeHandler('coverages', [...get(this.state, 'diff.coverages', []), newCoverage]);
    }

    tearDownEditorState() {
        this.setState({
            errors: {},
            errorMessages: [],
            submitFailed: false,
            diff: {},
        });
    }

    flushAutosave() {
        this.autosave.flush();
        // if (get(this.dom, 'autosave.flush')) {
        //     this.dom.autosave.flush();
        // }
    }

    cancelFromHeader() {
        const {openCancelModal, item, initialValues, itemType} = this.props;
        const {dirty, errors} = this.state;

        if (dirty) {
            this.flushAutosave();
            const hasErrors = !isEqual(errors, {});
            const isKilled = isItemKilled(item);

            openCancelModal({
                itemId: getItemId(initialValues),
                itemType: itemType,
                onIgnore: this.onCancel,
                onSave: (isKilled || hasErrors) ?
                    null :
                    (withConfirmation, updateMethod) => this.onSave(withConfirmation, updateMethod)
                        .finally(this.onCancel),
                onSaveAndPost: (isKilled && !hasErrors) ?
                    (withConfirmation, updateMethod) => this.onSaveAndPost(withConfirmation, updateMethod)
                        .finally(this.onCancel) :
                    null,
            });
        } else {
            this.onCancel();
        }
    }

    onCancel() {
        if (!this.props.inModalView && (this.tearDownRequired || !isExistingItem(this.props.item))) {
            this.tearDownEditorState();
        }

        if (this.editorHeaderComponent) {
            this.editorHeaderComponent.unregisterKeyBoardShortcuts();
        }

        this.props.cancel(this.props.item || this.props.initialValues);

        if (this.props.onCancel) {
            this.props.onCancel();
        }
    }

    setActiveTab(tab) {
        this.setState({tab});
    }

    onMinimized() {
        this.props.minimize();

        if (this.props.onCancel) {
            this.props.onCancel();
        }
    }

    // renderAutosave(isReadOnly) {
    //     if (!this.props.addNewsItemToPlanning &&
    //         !this.props.isLoadingItem &&
    //         this.props.itemType &&
    //         this.state.itemReady &&
    //         !isReadOnly
    //     ) {
    //         return (
    //             <Autosave
    //                 formName={this.props.itemType}
    //                 initialValues={this.props.item ?
    //                     cloneDeep(this.props.item) :
    //                     cloneDeep(this.props.initialValues)
    //                 }
    //                 currentValues={cloneDeep(this.state.diff)}
    //                 change={this.onChangeHandler}
    //                 ref={(node) => this.dom.autosave = node}
    //                 save={this.props.saveAutosave}
    //                 load={this.props.loadAutosave}
    //                 inModalView={this.props.inModalView}
    //                 submitting={this.state.submitting}
    //             />
    //         );
    //     }
    //
    //     return null;
    // }

    canEdit() {
        if (this.props.itemType === ITEM_TYPE.EVENT) {
            return eventUtils.canEditEvent(
                this.props.item,
                this.props.session,
                this.props.privileges,
                this.props.lockedItems
            );
        } else if (this.props.itemType === ITEM_TYPE.PLANNING) {
            return planningUtils.canEditPlanning(
                this.props.item,
                null,
                this.props.session,
                this.props.privileges,
                this.props.lockedItems
            );
        }

        return false;
    }

    renderContent(existingItem, isReadOnly) {
        // const existingItem = isExistingItem(this.props.item);
        // const itemLock = lockUtils.getLock(this.props.item, this.props.lockedItems);
        // const isLockRestricted = lockUtils.isLockRestricted(
        //     this.props.item,
        //     this.props.session,
        //     this.props.lockedItems
        // );
        //
        // let canEdit = this.canEdit();
        //
        // const isReadOnly = existingItem && (
        //     !canEdit ||
        //     !itemLock ||
        //     isLockRestricted ||
        //     get(itemLock, 'action') !== 'edit'
        // );

        const RenderTab = this.tabs[this.state.tab].enabled ? this.tabs[this.state.tab].render :
            this.tabs[0].render;

        return (
            <Content flex={true} className={this.props.contentClassName}>
                {existingItem && (
                    <NavTabs
                        tabs={this.tabs}
                        active={this.state.tab}
                        setActive={this.setActiveTab}
                        className="side-panel__content-tab-nav"
                    />
                )}

                <div className={classNames(
                    'side-panel__content-tab-content',
                    {'editorModal__editor--padding-bottom': !!get(this.props, 'navigation.padContentForNavigation')}
                )} >
                    {(!this.props.isLoadingItem && this.props.itemType) && (
                        <RenderTab
                            item={this.props.item || {}}
                            itemType={this.props.itemType}
                            itemExists={isExistingItem(this.state.diff)}
                            diff={this.state.diff}
                            onChangeHandler={this.onChangeHandler}
                            readOnly={isReadOnly}
                            addNewsItemToPlanning={this.props.addNewsItemToPlanning}
                            submitFailed={this.state.submitFailed}
                            errors={this.state.errors}
                            dirty={this.state.dirty}
                            startPartialSave={this.startPartialSave}
                            navigation={this.props.navigation}
                        />
                    )}
                </div>
            </Content>
        );
    }

    render() {
        if (!this.props.itemType || !this.props.itemId) {
            return null;
        }

        const existingItem = isExistingItem(this.props.item);
        const itemLock = lockUtils.getLock(this.props.item, this.props.lockedItems);
        const isLockRestricted = lockUtils.isLockRestricted(
            this.props.item,
            this.props.session,
            this.props.lockedItems
        );

        let canEdit = this.canEdit();

        const isReadOnly = existingItem && (
            !canEdit ||
            !itemLock ||
            isLockRestricted ||
            get(itemLock, 'action') !== 'edit'
        );

        return (
            <SidePanel shadowRight={true} className={this.props.className}>
                {/*{this.renderAutosave(isReadOnly)}*/}
                <EditorHeader
                    item={this.props.item}
                    diff={this.state.diff}
                    initialValues={this.props.item ?
                        cloneDeep(this.props.item) :
                        cloneDeep(this.props.initialValues)
                    }
                    onSave={this.onSave}
                    onPost={this.onPost}
                    onSaveAndPost={this.onSaveAndPost}
                    onUnpost={this.onUnpost}
                    onSaveUnpost={this.onSaveUnpost}
                    onAddCoverage={this.onAddCoverage}
                    cancel={this.cancelFromHeader}
                    minimize={this.onMinimized}
                    submitting={this.state.submitting}
                    dirty={this.state.dirty}
                    errors={this.state.errors}
                    session={this.props.session}
                    privileges={this.props.privileges}
                    contentTypes={this.props.contentTypes}
                    lockedItems={this.props.lockedItems}
                    openCancelModal={this.props.openCancelModal}
                    closeEditorAndOpenModal={this.props.closeEditorAndOpenModal}
                    users={this.props.users}
                    onUnlock={this.props.onUnlock}
                    onLock={this.props.onLock}
                    itemActions={this.props.itemActions}
                    ref={(ref) => this.editorHeaderComponent = ref}
                    itemType={this.props.itemType}
                    addNewsItemToPlanning={this.props.addNewsItemToPlanning}
                    showUnlock={this.props.showUnlock}
                    createAndPost={this.props.createAndPost}
                    hideItemActions={this.props.hideItemActions}
                    hideMinimize={this.props.hideMinimize}
                    hideExternalEdit={this.props.hideExternalEdit}
                    flushAutosave={this.flushAutosave}
                />
                {this.renderContent(existingItem, isReadOnly)}
            </SidePanel>
        );
    }
}

EditorComponent.propTypes = {
    item: PropTypes.object,
    itemId: PropTypes.string,
    itemType: PropTypes.string,
    cancel: PropTypes.func.isRequired,
    minimize: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onPost: PropTypes.func.isRequired,
    onUnpost: PropTypes.func.isRequired,
    session: PropTypes.object,
    privileges: PropTypes.object,
    lockedItems: PropTypes.object,
    openCancelModal: PropTypes.func.isRequired,
    users: PropTypes.array,
    closeEditorAndOpenModal: PropTypes.func,
    onUnlock: PropTypes.func,
    onLock: PropTypes.func,
    addNewsItemToPlanning: PropTypes.object,
    onValidate: PropTypes.func,
    formProfiles: PropTypes.object,
    occurStatuses: PropTypes.array,
    itemActions: PropTypes.object,
    loadItem: PropTypes.func,
    isLoadingItem: PropTypes.bool,
    initialValues: PropTypes.object,
    showUnlock: PropTypes.bool,
    hideItemActions: PropTypes.bool,
    hideMinimize: PropTypes.bool,
    createAndPost: PropTypes.bool,
    newsCoverageStatus: PropTypes.array,
    contentTypes: PropTypes.array,
    onChange: PropTypes.func,
    onCancel: PropTypes.func,
    className: PropTypes.string,
    contentClassName: PropTypes.string,
    navigation: PropTypes.object,
    inModalView: PropTypes.bool,
    hideExternalEdit: PropTypes.bool,
    notifyValidationErrors: PropTypes.func,
    saveAutosave: PropTypes.func,
    loadAutosave: PropTypes.func,
};
