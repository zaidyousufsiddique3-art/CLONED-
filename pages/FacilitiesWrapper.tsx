
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import SportsFacilitiesBooking from './SportsFacilitiesBooking';
import UserFacilitiesBooking from './UserFacilitiesBooking';

const FacilitiesWrapper: React.FC = () => {
    const { user } = useAuth();

    if (!user) return null;

    if (user.email.toLowerCase() === SPORTS_COORDINATOR_EMAIL.toLowerCase()) {
        return <SportsFacilitiesBooking />;
    }

    return <UserFacilitiesBooking />;
};

export default FacilitiesWrapper;
