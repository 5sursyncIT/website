import { randomUUID } from 'node:crypto';
import { database } from '@/lib/database';
import { recordContact, SubmissionConflict, contactNotificationsEnabled } from '@/lib/contact-delivery';
import {
  checkOrigin,
  errorResponse,
  HTTPError,
  readJSON,
} from "@/lib/backend";
import { contactSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const result = contactSchema.safeParse(await readJSON(request));
    if (!result.success)
      throw new HTTPError(400, "Vérifiez les champs du formulaire.");
    await rateLimit(request, "contact", 5);
    const supplied = request.headers.get('idempotency-key');
    if(supplied && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied))
      throw new HTTPError(400, 'Identifiant de demande invalide.');
    const { website, ...data } = result.data;
    await recordContact(database(),data,supplied || randomUUID(),process.env.APP_ORIGIN!,contactNotificationsEnabled());
    return Response.json(
      { message: "Votre demande a été enregistrée." },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e instanceof SubmissionConflict ? new HTTPError(409,e.message) : e);
  }
}
