import React from 'react';
import ReactDOM from 'react-dom';
import {Provider} from 'react-redux';
import {registerNotifications} from '../utils';
import * as actions from '../actions';
import {WORKSPACE} from '../constants';
import {PlanningApp} from '../apps';
import ng from 'superdesk-core/scripts/core/services/ng';

PlanningController.$inject = [
    '$element',
    '$scope',
    '$location',
    'sdPlanningStore',
    '$q',
    'superdeskFlags',
    '$route',
    'pageTitle',
    'gettext',
];
export function PlanningController(
    $element,
    $scope,
    $location,
    sdPlanningStore,
    $q,
    superdeskFlags,
    $route,
    pageTitle,
    gettext
) {
    // ng.waitForServicesToBeAvailable()
    //     .then(() => {
            const prevFlags = {
                workqueue: superdeskFlags.flags.workqueue,
                authoring: superdeskFlags.flags.authoring,
            };

            pageTitle.setUrl(gettext('Planning'));

            console.log('Attempting to get the store');

            // Check to see if the PlanningStore service is already loading
            // If so, then this controller was called twice
            // We only need the first call, so exit here
            if (sdPlanningStore.loading) {
                console.warn('Planning store service is already loading....');
                return;
            }

            sdPlanningStore.getStore(WORKSPACE.PLANNING)
                .then((store) => {
                    registerNotifications($scope, store);

                    $q.all({
                        locks: store.dispatch(actions.locks.loadAllLocks()),
                        agendas: store.dispatch(actions.fetchAgendas()),
                        userPreferences: store.dispatch(actions.users.fetchUserPreferences()),
                        calendars: store.dispatch(actions.events.api.fetchCalendars()),
                        autosaves: store.dispatch(actions.autosave.fetchAll()),
                    })
                        .then(() => {
                            // Load the current items that are currently open for Preview/Editing
                            store.dispatch(actions.main.filter());
                            store.dispatch(actions.main.openFromURLOrRedux('edit'));
                            store.dispatch(actions.main.openFromURLOrRedux('preview'));

                            $scope.$on('$destroy', () => {
                                // Unmount the React application
                                ReactDOM.unmountComponentAtNode($element.get(0));
                                store.dispatch(actions.resetStore());
                                superdeskFlags.flags.workqueue = prevFlags.workqueue;
                                superdeskFlags.flags.authoring = prevFlags.authoring;
                            });

                            $scope.$watch(
                                () => $route.current,
                                (route) => {
                                    if (route.href.startsWith('/planning')) {
                                        superdeskFlags.flags.workqueue = false;
                                        superdeskFlags.flags.authoring = false;
                                    }
                                }
                            );

                            // render the planning application
                            ReactDOM.render(
                                <Provider store={store}>
                                    <PlanningApp />
                                </Provider>,
                                $element.get(0)
                            );
                        });
                }, (error) => {
                    console.error(error);
                });
    // });
}
