import {isNil, zipObject, get, isEmpty} from 'lodash';
import {createStore} from '../utils';
import {ITEM_TYPE} from '../constants';
import {currentWorkspace as getCurrentWorkspace} from '../selectors/general';
import {initStore} from '../actions';


PlanningStoreService.$inject = [
    '$rootScope',
    'api',
    'config',
    '$location',
    '$timeout',
    'vocabularies',
    'superdesk',
    'upload',
    'notify',
    'privileges',
    'notifyConnectionService',
    'userList',
    'desks',
    'templates',
    'metadata',
    'session',
    'deployConfig',
    'gettext',
    'authoringWorkspace',
    'gettextCatalog',
    '$q',
    '$interpolate',
    'search',
    'contacts',
    'preferencesService',
];
export function PlanningStoreService(
    $rootScope,
    api,
    config,
    $location,
    $timeout,
    vocabularies,
    superdesk,
    upload,
    notify,
    privileges,
    notifyConnectionService,
    userList,
    desks,
    templates,
    metadata,
    session,
    deployConfig,
    gettext,
    authoringWorkspace,
    gettextCatalog,
    $q,
    $interpolate,
    search,
    contacts,
    preferencesService
) {
    let self = this;

    self.store = null;
    self.loading = false;

    this.getStore = function(workspace) {
        return new Promise((resolve, reject) => {
            console.log('self.store', !!self.store, 'self.loading', self.loading);

            if (!self.loading) {
                console.log('Store is not currently loading....');
                if (!isNil(self.store)) {
                    console.log('Store is already loaded');
                    return resolve(self.store);
                } else {
                    console.log('Loading the store');
                    this.createStore()
                        .then((store) => resolve(store));
                }
            } else {
                console.log('Store is currently loading, please wait....');
                let interval;

                const isStoreAvailable = () => {
                    console.log('Checking if the store is ready:');
                    if (!isNil(self.store) && !self.loading) {
                        console.log('\tStore is ready');
                        window.clearInterval(interval);
                        resolve(self.store);
                        return true;
                    }
                    console.log('\tStore is not ready');
                };

                if (isStoreAvailable() === true) {
                    // make sure it doesn't register an interval if it resolves on the first go
                    return true;
                }

                interval = setInterval(isStoreAvailable, 100);
                setTimeout(() => {
                    console.log('Timed out while waiting for the store');
                    clearInterval(interval);
                    reject('timed out while trying to create the Redux Store');
                }, 1000 * 60);
            }


            // if (!isNil(self.store) && !self.loading) {
            //     console.log('Store is already loaded');
            //     return resolve(self.store);
            // } else if (isNil(self.store) && !self.loading) {
            //     console.log('Loading store');
            //     self.loading = true;
            //     this.createStore()
            //         .then((store) => resolve(store));
            //     return true;
            // }

            // console.log('Store is currently loading, please wait....');
            // let interval;
            //
            // const isStoreAvailable = () => {
            //     console.log('Checking if the store is ready:');
            //     if (!isNil(self.store) && !self.loading) {
            //         console.log('\tStore is ready');
            //         window.clearInterval(interval);
            //         resolve(self.store);
            //         return true;
            //     }
            //     console.log('\tStore is not ready');
            // };
            //
            // if (isStoreAvailable() === true) {
            //     // make sure it doesn't register an interval if it resolves on the first go
            //     return true;
            // }
            //
            // interval = setInterval(isStoreAvailable, 100);
            // setTimeout(() => {
            //     console.log('Timed out while waiting for the store');
            //     clearInterval(interval);
            //     reject('timed out while trying to create the Redux Store');
            // }, 1000 * 60);

            // console.log('Store already loaded');
            // return Promise.resolve(self.store);
        })
            .then((store) => {
                self.loading = false;
                self.store = store;

                const currentWorkspace = getCurrentWorkspace(self.store.getState());

                if (currentWorkspace === workspace) {
                    return Promise.reject('current workspace is the same');
                }

                store.dispatch(initStore(workspace));
                console.log('Current workspace is not set or is different');
                return Promise.resolve(self.store);
            });
    };

    this.createStore = function() {
        const _notify = {
            pop: () => $timeout(() => notify.pop()),
            error: (msg, ttl, options) => $timeout(() => notify.error(msg, ttl, options)),
            success: (msg, ttl, options) => $timeout(() => notify.success(msg, ttl, options)),
            warning: (msg, ttl, options) => $timeout(() => notify.warning(msg, ttl, options)),
        };

        return $q.all({
            voc: vocabularies.getAllActiveVocabularies(),
            ingest: api('ingest_providers').query({
                max_results: 200,
                page: 1,
            }),
            privileges: privileges.loaded,
            metadata: metadata.initialize(),
            users: userList.getAll(),
            desks: desks.initialize(),
            all_templates: templates.fetchAllTemplates(1, 50, 'create'),
            formsProfile: api('planning_types').query({
                max_results: 200,
                page: 1,
            }),
            contacts: contacts.query({
                max_results: 200,
                page: 1,
                all: true,
                default_operator: 'AND',
                q: 'public:(1) is_active:(1)',
            }).then((items) => items),
        }).then((data) => {
            const genres = metadata.values.genre_custom
                ? metadata.values.genre_custom.map((item) => Object.assign({scheme: 'genre_custom'}, item))
                : metadata.values.genre;

            const initialState = {
                config: config,
                deployConfig: deployConfig.config,
                vocabularies: zipObject(
                    get(data, 'voc', []).map((cv) => cv._id),
                    get(data, 'voc', []).map((cv) => cv.items)
                ),
                ingest: {
                    providers: get(data, 'ingest._items', []).filter((p) =>
                        get(p, 'content_types', []).indexOf(ITEM_TYPE.EVENT) !== -1)
                        .map((provider) => ({
                            name: provider.name,
                            id: provider._id,
                        })),
                },
                privileges: data.privileges,
                subjects: metadata.values.subjectcodes,
                genres: genres,
                users: data.users,
                desks: desks.desks._items,
                templates: data.all_templates._items,
                workspace: {
                    currentDeskId: desks.getCurrentDeskId(),
                    currentStageId: desks.getCurrentStageId(),
                },
                session: {
                    sessionId: session.sessionId,
                    identity: session.identity,
                    userPreferences: {},
                },
                urgency: {
                    urgency: metadata.values.urgency,
                    label: gettextCatalog.getString('Urgency'),
                },
                forms: {profiles: {}},
                contacts: data.contacts._items,
                customVocabularies: metadata.cvs.filter((cv) =>
                    !isEmpty(cv.service) && get(cv, 'schema_field', 'subject') === 'subject' && isEmpty(cv.field_type)
                ),
            };

            // use custom cvs if any
            angular.extend(initialState.vocabularies, {
                genre: genres,
            });

            data.formsProfile._items.forEach((p) => {
                initialState.forms.profiles[p.name] = p;
            });

            // create the application store
            const store = createStore({
                initialState: initialState,
                extraArguments: {
                    api: api,
                    $location: $location,
                    $timeout: $timeout,
                    vocabularies: vocabularies,
                    superdesk: superdesk,
                    upload: upload,
                    notify: _notify,
                    privileges: privileges,
                    notifyConnectionService: notifyConnectionService,
                    userList: userList,
                    desks: desks,
                    templates: templates,
                    metadata: metadata,
                    session: session,
                    deployConfig: deployConfig,
                    gettextCatalog: gettextCatalog,
                    gettext: gettext,
                    authoringWorkspace: authoringWorkspace,
                    $interpolate: $interpolate,
                    search: search,
                    config: config,
                    contacts: contacts,
                    preferencesService: preferencesService,
                },
            });
            return store;
        });
    };

    this._reloadVocabularies = function() {
        if (isNil(self.store)) {
            return;
        }

        vocabularies.getAllActiveVocabularies()
            .then((voc) => {
                self.store.dispatch({
                    type: 'RECEIVE_VOCABULARIES',
                    payload: voc._items,
                });
            });
    };

    $rootScope.$watch(
        () => session.sessionId,
        () => self.store && self.store.dispatch({
            type: 'RECEIVE_SESSION',
            payload: {
                sessionId: session.sessionId,
                identity: session.identity,
            },
        })
    );

    $rootScope.$watch(
        () => desks.active,
        () => {
            // Update the store with workspace
            self.store && self.store.dispatch({
                type: 'WORKSPACE_CHANGE',
                payload: {
                    currentDeskId: get(desks, 'active.desk'),
                    currentStageId: get(desks, 'active.stage'),
                },
            });
        }
    );

    $rootScope.$on('vocabularies:updated', angular.bind(this, this._reloadVocabularies));
}