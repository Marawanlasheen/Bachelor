import { Toaster as SonnerToaster } from 'sonner';

export function ToastViewport() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton={false}
      toastOptions={{
        duration: 2000,
        classNames: {
          toast: 'border border-border bg-card text-card-foreground shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}
