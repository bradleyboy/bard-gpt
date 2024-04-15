import { useNavigate } from '@nokkio/router';
import { useAuth } from '@nokkio/auth';

import SignInWithGoogleButton from 'components/SignInWithGoogleButton';
import { useEffect } from 'react';

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate('/');
    }
  }, [auth?.isAuthenticated]);

  return (
    <div className="flex w-screen h-screen items-center justify-center">
      <SignInWithGoogleButton />
    </div>
  );
}
