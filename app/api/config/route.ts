import { json } from "@/lib/api";
import { isRegisterAllowed } from "@/lib/auth";

// GET /api/config —— 公开运行配置（前端据此隐藏注册入口等）
export const GET = () =>
  json({
    allowRegister: isRegisterAllowed(),
  });
