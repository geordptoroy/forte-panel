/**
 * End-to-end validation of the operational catalog and the professional
 * isolation. Run it against a live server:
 *
 *   node scripts/validate-flow.mjs http://localhost:3000
 *
 * The script uses only public HTTP routes (tRPC + versioned API), so it proves
 * the same behavior a real deployment would expose.
 */
const base = process.argv[2] ?? "http://localhost:3000";
const apiKey = process.env.FORTE_API_KEY ?? "chave-api-de-teste";
const adminEmail = process.env.LOCAL_ADMIN_EMAIL ?? "admin@fortepanel.local";
const adminPassword = process.env.LOCAL_ADMIN_PASSWORD ?? "senha-forte-12345";

let failures = 0;
const check = (label, condition, detail = "") => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
};

async function trpc(path, json, cookie) {
  const response = await fetch(`${base}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(json === undefined ? {} : { json }),
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload, cookie: setCookie.map((item) => item.split(";")[0]).join("; ") };
}

async function trpcQuery(path, cookie, json = null) {
  const response = await fetch(`${base}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json }))}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, payload: await response.json() };
}

const run = async () => {
  console.log(`\nForte Panel — validação end-to-end em ${base}`);
  const suffix = Date.now().toString().slice(-6);

  console.log("\n1. Login do proprietário");
  const login = await trpc("auth.localLogin", { email: adminEmail, password: adminPassword });
  check("login responde 200", login.status === 200, `status=${login.status}`);
  const adminCookie = login.cookie;
  check("cookie de sessão emitido", Boolean(adminCookie));

  console.log("\n2. Catálogo de serviços e profissionais");
  const service = await trpc("workspace.createService", { name: `Instalação ${suffix}`, description: "Serviço de validação", durationMinutes: 90, priceCents: 25000 }, adminCookie);
  const serviceId = service.payload?.result?.data?.json?.id;
  check("serviço criado", Boolean(serviceId), JSON.stringify(service.payload).slice(0, 160));

  const professionalA = await trpc("workspace.createProfessional", { name: `Executor A ${suffix}`, specialty: "Elétrica" }, adminCookie);
  const professionalAId = professionalA.payload?.result?.data?.json?.id;
  const professionalB = await trpc("workspace.createProfessional", { name: `Executor B ${suffix}`, specialty: "Hidráulica" }, adminCookie);
  const professionalBId = professionalB.payload?.result?.data?.json?.id;
  check("dois profissionais criados", Boolean(professionalAId && professionalBId));

  const link = await trpc("workspace.setServiceProfessionals", { serviceId, professionalIds: [professionalAId, professionalBId] }, adminCookie);
  check("vínculo serviço-profissionais salvo", link.payload?.result?.data?.json?.professionalIds?.length === 2);

  const availability = await trpc("workspace.setProfessionalAvailability", {
    professionalId: professionalAId,
    entries: [{ weekday: 1, startMinute: 540, endMinute: 1080 }, { weekday: 3, startMinute: 540, endMinute: 1080 }],
  }, adminCookie);
  check("disponibilidade semanal salva", availability.payload?.result?.data?.json?.entries?.length === 2);

  console.log("\n3. Acesso do profissional");
  const accountA = await trpc("workspace.createMember", {
    name: `Acesso A ${suffix}`, email: `prof_a_${suffix}@teste.local`, password: "senha-teste-12345",
    role: "agent", operationalRole: "professional", professionalId: professionalAId,
  }, adminCookie);
  check("acesso do executor A criado", Boolean(accountA.payload?.result?.data?.json?.id), JSON.stringify(accountA.payload).slice(0, 200));

  const accountB = await trpc("workspace.createMember", {
    name: `Acesso B ${suffix}`, email: `prof_b_${suffix}@teste.local`, password: "senha-teste-12345",
    role: "agent", operationalRole: "professional", professionalId: professionalBId,
  }, adminCookie);
  check("acesso do executor B criado", Boolean(accountB.payload?.result?.data?.json?.id));

  const loginA = await trpc("auth.localLogin", { email: `prof_a_${suffix}@teste.local`, password: "senha-teste-12345" });
  const cookieA = loginA.cookie;
  check("login do executor A funciona", loginA.status === 200 && Boolean(cookieA));
  const accessA = await trpcQuery("auth.access", cookieA);
  const accessAData = accessA.payload?.result?.data?.json;
  check("acesso A restrito à própria agenda", accessAData?.restrictedToOwnAgenda === true && accessAData?.professionalId === professionalAId, JSON.stringify(accessAData));
  check("acesso A não administra equipe", accessAData?.canManageTeam === false);

  console.log("\n4. Isolamento da agenda");
  const agendaA = await trpcQuery("professional.myAgenda", cookieA);
  check("portal do profissional vinculado", agendaA.payload?.result?.data?.json?.linked === true);

  const blockedRead = await trpcQuery("workspace.audit", cookieA, { limit: 10 });
  const blockedCode = blockedRead.payload?.error?.json?.data?.code ?? blockedRead.payload?.error?.data?.code;
  check("executor não lê auditoria (FORBIDDEN)", blockedRead.status === 403 || blockedCode === "FORBIDDEN", JSON.stringify(blockedRead.payload).slice(0, 200));

  const blockedRoster = await trpcQuery("workspace.members", cookieA, undefined);
  const rosterCode = blockedRoster.payload?.error?.json?.data?.code ?? blockedRoster.payload?.error?.data?.code;
  check("executor não lista a equipe (FORBIDDEN)", blockedRoster.status === 403 || rosterCode === "FORBIDDEN", JSON.stringify(blockedRoster.payload).slice(0, 200));

  const blockedProfessionals = await trpcQuery("workspace.professionalsDetailed", cookieA, undefined);
  const professionalsCode = blockedProfessionals.payload?.error?.json?.data?.code ?? blockedProfessionals.payload?.error?.data?.code;
  check("executor não lista todos os profissionais (FORBIDDEN)", blockedProfessionals.status === 403 || professionalsCode === "FORBIDDEN", JSON.stringify(blockedProfessionals.payload).slice(0, 200));

  const blockedCreate = await trpc("workspace.createService", { name: "Serviço indevido", durationMinutes: 30, priceCents: 0 }, cookieA);
  const blockedCreateCode = blockedCreate.payload?.error?.json?.data?.code ?? blockedCreate.payload?.error?.data?.code;
  check("executor não cria serviço (FORBIDDEN)", blockedCreate.status === 403 || blockedCreateCode === "FORBIDDEN");

  console.log("\n5. Agendamento e transição de status");
  const startsAt = new Date(Date.now() + 86_400_000);
  startsAt.setUTCHours(13, 0, 0, 0); // 10:00 in America/Sao_Paulo
  const saoPauloWeekday = (date) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Sao_Paulo" }).format(date);
  while (!["Mon", "Wed"].includes(saoPauloWeekday(startsAt))) startsAt.setUTCDate(startsAt.getUTCDate() + 1);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  const appointment = await trpc("agenda.create", {
    serviceId, professionalId: professionalAId,
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), notes: "Validação end-to-end",
  }, adminCookie);
  const appointmentId = appointment.payload?.result?.data?.json?.id;
  check("agendamento criado pelo gestor", Boolean(appointmentId), JSON.stringify(appointment.payload).slice(0, 220));

  if (appointmentId) {
    const move = await trpc("agenda.updateMyStatus", {
      id: appointmentId, status: "in_progress",
    }, cookieA);
    check("executor inicia o próprio atendimento", move.payload?.result?.data?.json?.status === "in_progress", JSON.stringify(move.payload).slice(0, 200));
  }

  const appointmentData = appointment.payload?.result?.data?.json;
  const outsideStart = new Date(startsAt);
  outsideStart.setUTCHours(22, 0, 0, 0); // 19:00 local, after the configured 18:00 close
  const outsideHours = await trpc("agenda.create", {
    serviceId, professionalId: professionalAId,
    startsAt: outsideStart.toISOString(), endsAt: new Date(outsideStart.getTime() + 60 * 60_000).toISOString(),
  }, adminCookie);
  const outsideHoursCode = outsideHours.payload?.error?.json?.data?.code ?? outsideHours.payload?.error?.data?.code;
  check("tRPC recusa horário fora da jornada (CONFLICT)", outsideHours.status === 409 || outsideHoursCode === "CONFLICT", JSON.stringify(outsideHours.payload).slice(0, 200));

  const restOutside = await fetch(`${base}/api/v1/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": `validate-outside-${suffix}` },
    body: JSON.stringify({ serviceId, professionalId: professionalAId, startsAt: outsideStart.toISOString(), endsAt: new Date(outsideStart.getTime() + 60 * 60_000).toISOString() }),
  });
  const restOutsideBody = await restOutside.json();
  check("API recusa horário fora da jornada (409)", restOutside.status === 409 && restOutsideBody.error === "outside_working_hours", JSON.stringify(restOutsideBody).slice(0, 200));
  const healthAfterRejectedBooking = await fetch(`${base}/api/v1/health`);
  check("servidor continua saudável após reserva recusada", healthAfterRejectedBooking.status === 200);

  const restOverlap = await fetch(`${base}/api/v1/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": `validate-overlap-${suffix}` },
    body: JSON.stringify({ serviceId, professionalId: professionalAId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }),
  });
  const restOverlapBody = await restOverlap.json();
  check("API recusa sobreposição com outra reserva (409)", restOverlap.status === 409 && restOverlapBody.error === "appointment_conflict", JSON.stringify(restOverlapBody).slice(0, 200));

  if (appointmentData?.id) {
    const reschedule = await fetch(`${base}/api/v1/appointments/${appointmentData.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": `validate-reschedule-${suffix}` },
      body: JSON.stringify({ startsAt: outsideStart.toISOString(), endsAt: new Date(outsideStart.getTime() + 60 * 60_000).toISOString() }),
    });
    const rescheduleBody = await reschedule.json();
    check("API recusa reagendamento fora da jornada (409)", reschedule.status === 409 && rescheduleBody.error === "outside_working_hours", JSON.stringify(rescheduleBody).slice(0, 200));
  }

  console.log("\n6. API v1 de disponibilidade");
  const availabilityResponse = await fetch(`${base}/api/v1/availability?serviceId=${serviceId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const availabilityBody = await availabilityResponse.json();
  check("GET /availability responde 200", availabilityResponse.status === 200, `status=${availabilityResponse.status}`);
  check("serviço consultado aparece", (availabilityBody.services ?? []).some((item) => item.id === serviceId));
  check("profissionais do serviço aparecem", (availabilityBody.professionals ?? []).length >= 2, JSON.stringify(availabilityBody.professionals ?? []).slice(0, 200));
  check("cada profissional traz serviceIds", (availabilityBody.professionals ?? []).every((item) => Array.isArray(item.serviceIds)));
  check("profissional expõe jornada semanal", (availabilityBody.professionals ?? []).find((item) => item.id === professionalAId)?.weeklyAvailability?.length === 2, JSON.stringify(availabilityBody.professionals ?? []).slice(0, 240));

  const wrongLink = await fetch(`${base}/api/v1/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": `validate-${suffix}` },
    body: JSON.stringify({
      serviceId: serviceId + 999_999, professionalId: professionalAId,
      startsAt: new Date(Date.now() + 172_800_000).toISOString(),
      endsAt: new Date(Date.now() + 176_400_000).toISOString(),
    }),
  });
  check("API recusa serviço inexistente (409)", wrongLink.status === 409, `status=${wrongLink.status}`);

  console.log(`\n${failures === 0 ? "TODAS AS VALIDAÇÕES PASSARAM" : `${failures} VALIDAÇÃO(ÕES) FALHARAM`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("Falha inesperada na validação:", error);
  process.exit(1);
});
