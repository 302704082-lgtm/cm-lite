import { NextRequest } from 'next/server';
import { handle, ok, requireUser } from '@/lib/api';
import { preview, type ProfileStep } from '@/lib/rule-config';

export const dynamic = 'force-dynamic';

/** 沙盒试跑：按当前填写的规则推演一遍，不写任何业务数据 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const body = (await req.json()) as {
      values?: Record<string, string>;
      steps?: ProfileStep[];
    };
    const result = preview({
      values: body.values ?? {},
      steps: Array.isArray(body.steps) ? body.steps : [],
    });
    return ok(result);
  });
}
