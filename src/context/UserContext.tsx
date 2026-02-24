import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

type User = {
    user_id: string;
    username: string;
    firstname: string;
    lastname: string;
    permissions: number;
    branch_id: string | null;
    avatar?: string;
};

type UserContextType = {
    user: User | null;
    isLoggedIn: boolean;
    login: (userData: User, token: string) => void;
    logout: () => void;
    updateUser: (updates: Partial<User>) => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const savedUser = localStorage.getItem('user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
        return !!localStorage.getItem('token');
    });

    const login = (userData: User, token: string) => {
        setUser(userData);
        setIsLoggedIn(true);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', token);
    };

    const logout = () => {
        setUser(null);
        setIsLoggedIn(false);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    };

    const updateUser = (updates: Partial<User>) => {
        if (user) {
            const newUser = { ...user, ...updates };
            setUser(newUser);
            localStorage.setItem('user', JSON.stringify(newUser));
        }
    };

    return (
        <UserContext.Provider value={{ user, isLoggedIn, login, logout, updateUser }}>
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
