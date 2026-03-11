import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/app/app-shell'
import { SoundsPage } from '@/features/sounds/sounds-page'

const router = createBrowserRouter([
  {
    element: <AppShell />,
    path: '/',
    children: [
      {
        element: <SoundsPage />,
        path: '/',
      },
    ],
  },
])

export const AppRouter = () => <RouterProvider router={router} />
