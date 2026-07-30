import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackMessage?: string;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // You can also log the error to an error reporting service here
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl border border-gray-100 min-h-[300px] w-full h-full text-center">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Algo salió mal
                    </h2>
                    <p className="text-gray-500 mb-6 max-w-md">
                        {this.props.fallbackMessage || 'Ocurrió un error inesperado al renderizar este componente. Por favor, intenta recargar la vista.'}
                    </p>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 w-full max-w-md mb-6 overflow-auto text-left">
                        <p className="text-xs text-red-600 font-mono whitespace-pre-wrap break-words">
                            {this.state.error?.message || 'Error desconocido'}
                        </p>
                    </div>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-all shadow-sm"
                    >
                        <RefreshCw size={18} />
                        Recargar Vista
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
