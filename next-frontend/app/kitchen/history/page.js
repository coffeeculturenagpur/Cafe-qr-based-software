import StaffOrderHistory from "../../../components/staff/StaffOrderHistory";

export default function KitchenHistoryPage() {
  return (
    <StaffOrderHistory
      title="Order history — Chef"
      backHref="/kitchen"
      roleGate="kitchen"
      dashboardLabel="Chef dashboard"
    />
  );
}
