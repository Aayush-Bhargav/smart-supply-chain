import './globals.css'
import type { Metadata } from 'next'
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: 'Supply Chain Route Optimizer',
  description: 'AI-powered supply chain route optimization and visualization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <div className="min-h-screen bg-gray-50">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
