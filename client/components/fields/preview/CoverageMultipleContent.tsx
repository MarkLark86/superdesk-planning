import * as React from 'react';
import {Label} from 'superdesk-ui-framework/react';

import {superdeskApi} from '../../../superdeskApi';
import {IListFieldProps, IPlanningCoverageItem} from '../../../interfaces';
import {PreviewFormItem} from './base/PreviewFormItem';

interface IProps extends IListFieldProps {
    item: IPlanningCoverageItem;
}

export class PreviewFieldCoverageMultipleContent extends React.PureComponent<IProps> {
    render() {
        if (!this.props.item.planning?.multiple_content) {
            return null;
        }

        return (
            <PreviewFormItem renderEmpty={true}>
                <Label
                    text={superdeskApi.localization.gettext('Multiple Content')}
                    type="highlight"
                />
            </PreviewFormItem>
        );
    }
}
