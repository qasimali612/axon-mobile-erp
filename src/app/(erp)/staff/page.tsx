import { StaffWorkspace } from "@/components/staff/staff-workspace";

export const metadata = {
  title: "Staff Management · AXON ERP",
};

export default function StaffPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <StaffWorkspace />
    </div>
  );
}

