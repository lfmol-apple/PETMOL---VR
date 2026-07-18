/**
 * Google Maps API Loader - Singleton Pattern (SECURE VERSION)
 * Ensures Google Maps script is loaded only once across the entire application
 * ⚠️ This loader is now disabled when NEXT_PUBLIC_PLACES_ENABLED != 'true'
 */

const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-script';
// Kill switch: Google Maps JS SDK só carrega quando PLACES habilitado
const PLACES_ENABLED = process.env.NEXT_PUBLIC_PLACES_ENABLED === 'true';

type LoaderState = 'idle' | 'loading' | 'loaded' | 'error';

class GoogleMapsLoader {
  private state: LoaderState = 'idle';
  private loadPromise: Promise<void> | null = null;
  private listeners: Array<(loaded: boolean) => void> = [];

  /**
   * Load Google Maps API
   * ⚠️ REQUIRES NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable
   * Returns a promise that resolves when the script is loaded
   * If already loaded, resolves immediately
   */
  load(): Promise<void> {
    // Kill switch: não injetar o script do Google quando Places desativado
    if (!PLACES_ENABLED) {
      return Promise.reject(new Error('Google Maps disabled: NEXT_PUBLIC_PLACES_ENABLED is not true'));
    }

    // Check for API key
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      const error = new Error('SECURITY: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required. No hardcoded fallback allowed.');
      console.error(error);
      return Promise.reject(error);
    }

    // Already loaded
    if (this.state === 'loaded' && typeof (window as unknown as Record<string, unknown>).google !== 'undefined') {
      return Promise.resolve();
    }

    // Already loading
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Start loading
    this.state = 'loading';
    this.loadPromise = new Promise((resolve, reject) => {
      // Check if script already exists
      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      if (existingScript) {
        if (typeof (window as unknown as Record<string, unknown>).google !== 'undefined') {
          this.state = 'loaded';
          this.notifyListeners(true);
          resolve();
          return;
        }
      }

      // Create script element
      const script = document.createElement('script');
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        this.state = 'loaded';
        this.notifyListeners(true);
        resolve();
      };

      script.onerror = () => {
        this.state = 'error';
        this.loadPromise = null;
        this.notifyListeners(false);
        reject(new Error('Failed to load Google Maps script'));
      };

      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  /**
   * Check if Google Maps is loaded
   */
  isLoaded(): boolean {
    return this.state === 'loaded' && typeof (window as unknown as Record<string, unknown>).google !== 'undefined';
  }

  /**
   * Get current loading state
   */
  getState(): LoaderState {
    return this.state;
  }

  /**
   * Register a listener for load events
   */
  onLoad(callback: (loaded: boolean) => void): () => void {
    this.listeners.push(callback);
    
    // If already loaded, call immediately
    if (this.state === 'loaded') {
      callback(true);
    }

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(loaded: boolean): void {
    this.listeners.forEach(callback => callback(loaded));
  }
}

// Export singleton instance
export const googleMapsLoader = new GoogleMapsLoader();
