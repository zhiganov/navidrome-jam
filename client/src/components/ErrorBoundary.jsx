import { Component } from 'react';

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the entire app.
 *
 * Note: Error boundaries do NOT catch errors for:
 * - Event handlers (use try-catch for those)
 * - Asynchronous code (e.g., setTimeout or requestAnimationFrame callbacks)
 * - Server-side rendering
 * - Errors thrown in the error boundary itself
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    // Reset the error boundary state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    // Hard reload the page
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            textAlign: 'center'
          }}>
            <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>😕</h1>
            <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>
              Something went wrong
            </h2>
            <p style={{
              fontSize: '16px',
              marginBottom: '24px',
              color: '#999',
              lineHeight: '1.5'
            }}>
              The application encountered an unexpected error. Don't worry, your music session data is safe.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details style={{
                textAlign: 'left',
                backgroundColor: '#2a2a2a',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '14px',
                overflow: 'auto'
              }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px', fontWeight: 'bold' }}>
                  Error Details (Development Only)
                </summary>
                <pre style={{
                  margin: '8px 0',
                  overflow: 'auto',
                  color: '#ff6b6b'
                }}>
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo && (
                  <pre style={{
                    margin: '8px 0',
                    overflow: 'auto',
                    fontSize: '12px',
                    color: '#999'
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#45a049'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#4CAF50'}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#666'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#555'}
              >
                Reload Page
              </button>
            </div>

            <p style={{
              marginTop: '32px',
              fontSize: '14px',
              color: '#666'
            }}>
              If this problem persists, please report it on GitHub.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
