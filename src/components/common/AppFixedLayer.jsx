import React from 'react'

export default function AppFixedLayer({ className = '', innerClassName = '', children }) {
    return (
        <div className={`pointer-events-none fixed left-1/2 w-full max-w-md -translate-x-1/2 ${className}`}>
            <div className={`pointer-events-auto ${innerClassName}`}>
                {children}
            </div>
        </div>
    )
}