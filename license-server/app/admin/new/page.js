import { requireAdminPage } from '@/lib/admin.js';
import AdminHeader from '../AdminHeader.js';
import CreateKeyForm from './CreateKeyForm.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create key - CorePOS Licenses' };

export default async function NewKeyPage() {
  await requireAdminPage();
  return (
    <>
      <AdminHeader />
      <main className="container">
        <CreateKeyForm downloadUrl={process.env.DOWNLOAD_URL || ''} />
      </main>
    </>
  );
}
