import React, { createContext, useContext, useState, ReactNode } from 'react';

type User = {
    name: string;
    email: string;
    phone: string;
    role: string;
    avatar: string;
};

type UserContextType = {
    user: User;
    updateUser: (updates: Partial<User>) => void;
};

const defaultUser: User = {
    name: 'Orlando Laurentius',
    email: 'orlando@resto.com',
    phone: '+63 912 345 6789',
    role: 'Admin',
    avatar: 'https://picsum.photos/seed/admin/100/100',
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User>(defaultUser);

    const updateUser = (updates: Partial<User>) => {
        setUser((prev) => ({ ...prev, ...updates }));
    };

    return (
        <UserContext.Provider value={{ user, updateUser }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};
