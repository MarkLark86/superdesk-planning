import {throttle, get, pickBy, cloneDeep} from 'lodash';
import moment from 'moment';

import {ITEM_TYPE} from '../../../constants';
import {getItemType} from '../../../utils';

export default class Autosave {
    constructor(onChange, interval, saveAutosave, loadAutosave) {
        this.throttledSave = null;
        this.onChange = onChange;
        this.interval = interval;
        this.saveAutosave = saveAutosave;
        this.loadAutosave = loadAutosave;
    }

    save(diff) {
        if (!this.throttledSave) {
            this.throttledSave = throttle(
                this._save,
                this.interval,
                {leading: false, trailing: true}
            );
        }

        this.throttledSave(diff);
    }

    _save(diff) {
        const itemType = getItemType(diff);
        const autosave = pickBy(cloneDeep(diff), (value, key) => (
            key === '_planning_item' ||
            key === '_id' ||
            !key.startsWith('_')
        ));

        if (itemType === ITEM_TYPE.EVENT) {
            if (get(autosave, 'location')) {
                autosave.location = [autosave.location];
            }
        } else if (itemType === ITEM_TYPE.PLANNING) {
            get(autosave, 'coverages', []).forEach((coverage) => {
                if (get(coverage, 'planning.genre')) {
                    coverage.planning.genre = [coverage.planning.genre];
                }
            });
        }

        this.saveAutosave(autosave);
    }

    load(itemType, itemId) {
        this.loadAutosave(itemType, itemId)
            .then((autosaveData) => {
                if (itemType === ITEM_TYPE.EVENT) {
                    if (get(autosaveData, 'dates.start')) {
                        autosaveData.dates.start = moment(autosaveData.dates.start);
                    }

                    if (get(autosaveData, 'dates.end')) {
                        autosaveData.dates.end = moment(autosaveData.dates.end);
                    }

                    if (get(autosaveData, 'location[0]')) {
                        autosaveData.location = autosaveData.location[0];
                    } else {
                        delete autosaveData.location;
                    }
                } else if (itemType === ITEM_TYPE.PLANNING) {
                    if (get(autosaveData, 'planning_date')) {
                        autosaveData.planning_date = moment(autosaveData.planning_date);
                    }

                    get(autosaveData, 'coverages', []).forEach((coverage) => {
                        if (get(coverage, 'planning.genre[0]')) {
                            coverage.planning.genre = coverage.planning.genre[0];
                        }

                        if (get(coverage, 'planning.scheduled')) {
                            coverage.planning.scheduled = moment(coverage.planning.scheduled);
                        }
                    });
                }

                this.onChange(
                    pickBy(autosaveData, (value, key) => !key.startsWith('_') && !key.startsWith('lock_')),
                    null,
                    true,
                    false
                );
            });
    }

    flush() {
        if (get(this, 'throttledSave.flush')) {
            this.throttledSave.flush();
        }
    }
}
