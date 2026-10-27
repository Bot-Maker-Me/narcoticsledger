import { useState, useEffect } from 'react';
import { X, Cookie, Check } from 'lucide-react';

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setIsVisible(true);
    } else {
      setHasConsented(consent === 'accepted');
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setHasConsented(true);
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookie-consent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-ink-900/95 p-4 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-500" />
          <div className="text-sm">
            <p className="mb-1 font-medium text-neutral-800">Cookie &amp; Privacy Consent</p>
            <p className="text-xs text-neutral-500">
              We use cookies and similar technologies to provide our services, analyze usage, and comply with Canadian privacy laws (PIPEDA). 
              By continuing, you agree to our use of cookies for these purposes. <a href="/terms" className="text-primary-500 underline hover:text-primary-700">Learn more</a>
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={handleDecline}
            className="px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="btn-primary gap-1.5 px-4 py-1.5 text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1.5 text-neutral-400 transition-colors hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
