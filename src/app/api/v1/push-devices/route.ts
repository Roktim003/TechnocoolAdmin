import { pushDeviceHandlers } from "@/modules/notifications/interface/http";

export const GET = pushDeviceHandlers.list;
export const POST = pushDeviceHandlers.register;
