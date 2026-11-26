import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { q1 } from '@/lib/db';
import {
  getInstance,
  getSignoffs,
  instanceChecks,
  instanceData,
  instanceItems,
  templateFields,
  templateChecks,
  templateSignoffs,
  type FormTemplateRow,
} from '@/lib/flow';
import { ROLE_NAMES } from '@/lib/constants';
import { resolveRoleCode } from '@/lib/profile';
import { Badge, PageHeader } from '@/components/ui';
import FormEditor from '@/components/form-editor';

export const dynamic = 'force-dynamic';

export default async function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const inst = await getInstance(user.tenantId, id);
  if (!inst) notFound();
  const t = await q1<FormTemplateRow>(`SELECT * FROM form_templates WHERE id = ?`, [inst.template_id]);
  if (!t) notFound();
  const signoffs = await getSignoffs(id);

  const steps = templateSignoffs(t);
  const done = new Map(signoffs.map((s) => [s.step_no, s]));
  const nextStep = steps.find((s) => !done.has(Number(s.step_no))) ?? null;

  const statusTone = inst.status === 'APPROVED' ? 'green' : inst.status === 'REJECTED' ? 'red' : inst.status === 'SUBMITTED' ? 'amber' : 'gray';
  const statusText = { DRAFT: '草稿', SUBMITTED: '待签署', APPROVED: '已批准', REJECTED: '已驳回' }[inst.status] ?? inst.status;

  return (
    <div>
      <PageHeader
        title={inst.title}
        desc={`${inst.code} · ${t.name} · 申请人 ${inst.created_by}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={statusTone}>{statusText}</Badge>
            <a
              href={`/api/forms/${inst.id}?format=html`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              打印 / 另存 PDF
            </a>
            <Link href="/app/forms" className="text-sm text-slate-500 hover:text-slate-700">
              ← 返回表单中心
            </Link>
          </div>
        }
      />

      {t.note ? (
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          {t.note}
        </div>
      ) : null}

      <FormEditor
        id={inst.id}
        code={inst.code}
        status={inst.status}
        fields={templateFields(t)}
        checks={instanceChecks(inst)}
        items={instanceItems(inst)}
        data={instanceData(inst)}
        steps={steps.map((s) => {
          const r = done.get(Number(s.step_no));
          return {
            step_no: Number(s.step_no),
            step_name: s.step_name,
            role_label: s.role_label,
            signer_name: r?.signer_name ?? null,
            decision: r?.decision ?? null,
            comment: r?.comment ?? null,
            signed_at: r?.signed_at ?? null,
          };
        })}
        nextStep={nextStep ? Number(nextStep.step_no) : null}
        nextRole={nextStep?.role_label ?? ''}
        currentRole={ROLE_NAMES[user.role] ?? user.role}
        canSign={nextStep ? resolveRoleCode(nextStep.role_label) === user.role : false}
        submittedAt={inst.submitted_at}
        closedAt={inst.closed_at}
        createdAt={inst.created_at}
        templateChecks={templateChecks(t)}
      />
    </div>
  );
}
