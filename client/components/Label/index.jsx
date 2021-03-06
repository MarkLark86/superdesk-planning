import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import './style.scss';

export const Label = ({text, iconType, verbose, isHollow, tooltip, onClick, id}) => {
    const labelClasses = classNames(
        'label',
        `label--${iconType}`,
        {
            'label--hollow': isHollow,
            'label--clickable': !!onClick,
        }
    );

    const label = tooltip ? (
        <span
            id={id}
            name={id}
            className={labelClasses}
            data-sd-tooltip={tooltip.text}
            data-flow={tooltip.flow ? tooltip.flow : 'down'}
        >
            {verbose ? verbose : text}
        </span>
    ) : (
        <span
            id={id}
            name={id}
            className={labelClasses}
        >
            {verbose ? verbose : text}
        </span>
    );

    return onClick ?
        <a onClick={onClick}>{label}</a> :
        label;
};

Label.propTypes = {
    id: PropTypes.string,
    text: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node,
    ]).isRequired,
    iconType: PropTypes.string,
    isHollow: PropTypes.bool,
    tooltip: PropTypes.object,
    verbose: PropTypes.string,
    onClick: PropTypes.func,
};

Label.defaultProps = {
    iconType: 'draft',
    isHollow: true,
    tooltip: undefined,
};