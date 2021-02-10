import React from 'react';
import PropTypes from 'prop-types';

import {ButtonStack} from './ButtonStack';

/**
 * @ngdoc react
 * @name Button
 * @description Button of a Sub Nav bar
 */
export const Button = ({children, className, right, buttonClassName, onClick, padded, testId}) => (
    <ButtonStack
        right={right}
        padded={padded}
        className={className}
    >
        <button className={buttonClassName} onClick={onClick} data-test-id={testId}>
            {children}
        </button>
    </ButtonStack>
);

Button.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    right: PropTypes.bool,
    buttonClassName: PropTypes.string,
    onClick: PropTypes.func,
    padded: PropTypes.bool,
    testId: PropTypes.string,
};

Button.defaultProps = {
    right: false,
    padded: false,
};
