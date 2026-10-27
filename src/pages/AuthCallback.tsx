import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';

/**
 * Landing route for links that Supabase redirects back to (signup confirmation, magic
 * links). supabase-js has already exchanged the token by the time this renders, so the
 * page only has to wait for the session and then hand over.
 */
export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const errorDescription =
      searchParams.get('error_description') ?? hashParams.get('error_description');

    if (errorDescription) {
      toast.error(errorDescription);
      navigate('/login', { replace: true });
      return;
    }

    if (loading) return;

    if (user) {
      toast.success('You are signed in');
      navigate('/dashboard', { replace: true });
      return;
    }

    toast.error('That link is invalid or has expired. Please sign in.');
    navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
        <p className="mt-3 text-sm text-neutral-500">Finishing sign in...</p>
      </div>
    </div>
  );
}
