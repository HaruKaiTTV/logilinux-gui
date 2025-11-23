import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ShieldAlert, Terminal } from 'lucide-react';

interface PermissionStatus {
  has_access: boolean;
  message: string;
  can_elevate: boolean;
}

interface PermissionGuardProps {
  children: React.ReactNode;
}

export function PermissionGuard({ children }: PermissionGuardProps) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [elevating, setElevating] = useState(false);

  const checkPermissions = async () => {
    try {
      const result = await invoke<PermissionStatus>('check_permissions');
      setStatus(result);
    } catch (error) {
      console.error('Failed to check permissions:', error);
      setStatus({
        has_access: false,
        message: 'Failed to check permissions: ' + error,
        can_elevate: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleElevate = async () => {
    setElevating(true);
    try {
      await invoke('request_elevation');
    } catch (error) {
      console.error('Elevation failed:', error);
      alert('Failed to elevate privileges: ' + error);
      setElevating(false);
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-logi-blue mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (status && !status.has_access) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-orange-500" />
              <div>
                <CardTitle>Device Access Required</CardTitle>
                <CardDescription>
                  LogiLinux GUI needs permission to access input devices
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Permission Issue Detected</p>
                <p>Your user account doesn't have permission to access Logitech devices.</p>
              </div>
            </div>

            <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
              {status.message}
            </div>

            {status.can_elevate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 mb-3">
                  <strong>Quick Fix:</strong> You can temporarily run the app with elevated privileges using the button below.
                  This will show a system authentication dialog.
                </p>
                <p className="text-xs text-blue-600">
                  For a permanent solution, follow the instructions above to set up udev rules and user groups.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-3">
            {status.can_elevate && (
              <Button 
                onClick={handleElevate} 
                disabled={elevating}
                className="flex items-center gap-2"
              >
                <ShieldAlert className="h-4 w-4" />
                {elevating ? 'Requesting Access...' : 'Run with Elevated Access'}
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={checkPermissions}
              className="flex items-center gap-2"
            >
              <Terminal className="h-4 w-4" />
              Recheck Permissions
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
