import React from 'react'

export default class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        console.error('Unhandled app error:', error, errorInfo)
    }

    handleReload = () => {
        window.location.reload()
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[50vh] flex items-center justify-center px-4">
                    <div className="w-full max-w-sm rounded-3xl border border-red-900/40 bg-surface p-6 text-center shadow-2xl">
                        <div className="text-lg font-bold text-white">Wystąpił błąd widoku</div>
                        <p className="mt-3 text-sm text-gray-400">
                            Moduł został zatrzymany, aby nie pokazać uszkodzonego ekranu. Odśwież aplikację i spróbuj ponownie.
                        </p>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 font-bold text-white transition active:scale-95"
                        >
                            Odśwież aplikację
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}