import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import './globals.css';
import RootProviders from './providers/RootProviders';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Project & Cost Management System',
  description: 'Manage renovation projects, cost estimates, and staff schedules',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen flex flex-col">
        <RootProviders session={session}>
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
        </RootProviders>
      </body>
    </html>
  );
}