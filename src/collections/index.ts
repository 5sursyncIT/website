import { revalidatePath, revalidateTag } from "next/cache";
import type { CollectionConfig, Field, GlobalConfig } from "payload";
import { Forbidden, APIError } from "payload";
import {
  adminOnly,
  tenantRead,
  clientOrAdmin,
  clientID,
  isAdmin,
  isFullAdmin,
  isTicketStaff,
  canUseCRM,
  crmOnly,
  staffRole,
  staffRoles,
  ticketStaffOnly,
  relationID,
} from "@/lib/access";
import path from "node:path";
import { isSocialURL, socialPlatforms } from "@/lib/social";
import {
  builtinIllustrationOptions,
  builtinLogoOptions,
  projectStatuses,
} from "@/lib/showcase";
import { serviceLabel, topicLabel, topics } from "@/lib/contact-topics";
import { ticketPriorities } from "@/lib/support";
import { clientCRMFields, clientPipelineHook, clientSearchFields, searchHook } from "./crm";
import { canManageAdmins, canSetRights, mailLevels } from "@/lib/mail/access";
export { CRMContacts, CRMDeals, CRMActivities, CRMDocuments } from "./crm";
// Admin navigation groups (presentation only, no schema impact).
const group = {
  inbox: "Demandes",
  support: "Support client",
  site: "Site web",
  settings: "Administration",
};
const privateFields = (fields: Field[]): Field[] => fields;
export const Admins: CollectionConfig = {
  slug: "admins",
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        // The bootstrap administrator (first account, private path only, see beforeValidate)
        // manages accounts; nobody else can grant that right to themselves.
        if (operation === "create" && !req.user && (doc.manageAdmins !== true || doc.role !== "full")) {
          const count = await req.payload.count({ collection: "admins", overrideAccess: true, req });
          if (count.totalDocs === 1)
            await req.payload.update({ collection: "admins", id: doc.id, data: { manageAdmins: true, role: "full" }, overrideAccess: true, req });
        }
        return doc;
      },
    ],
    beforeChange: [
      // Managing accounts is reserved to full administrators.
      ({ data, originalDoc }) => {
        if ((data.role ?? originalDoc?.role) !== "full") data.manageAdmins = false;
        return data;
      },
    ],
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (data?.password && String(data.password).length < 14)
          throw new APIError(
            "Password must contain at least 14 characters",
            400,
          );
        if (operation === "create" && !isAdmin(req.user)) {
          const approved = process.env.BOOTSTRAP_ADMIN_EMAIL;
          // Public Nginx always sets X-Real-IP; the SSH tunnel does not. Next itself
          // adds X-Forwarded-For to every request, so that header proves nothing.
          const proxied = req.headers?.get("x-real-ip");
          const count = await req.payload.count({
            collection: "admins",
            overrideAccess: true,
            req,
          });
          if (
            proxied ||
            count.totalDocs !== 0 ||
            !approved ||
            data?.email?.toLowerCase() !== approved.toLowerCase()
          )
            throw new Forbidden(req.t);
        }
        return data;
      },
    ],
  },
  auth: {
    tokenExpiration: 3600,
    maxLoginAttempts: 5,
    lockTime: 900000,
    cookies: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    },
  },
  labels: { singular: "Administrateur", plural: "Administrateurs" },
  admin: {
    useAsTitle: "email",
    group: group.settings,
    defaultColumns: ["name", "email", "updatedAt"],
    hideAPIURL: true,
  },
  access: {
    // Every profile signs in here; a CRM-only account is sent on to /crm (Overview).
    admin: ({ req }) => staffRole(req.user) !== null,
    // Accounts are managed only by full administrators holding the "manageAdmins" right
    // (separate from the mailbox rights). Everyone else edits only their own name and password.
    create: ({ req }) => isFullAdmin(req.user) && canManageAdmins(req.user),
    read: ({ req }) => isAdmin(req.user),
    update: ({ req, id }) => isAdmin(req.user) && (String(req.user!.id) === String(id) || (isFullAdmin(req.user) && canManageAdmins(req.user))),
    delete: ({ req, id }) => isFullAdmin(req.user) && String(req.user!.id) !== String(id) && canManageAdmins(req.user),
  },
  fields: [
    { name: "name", label: "Nom", type: "text", required: true },
    {
      name: "role",
      label: "Profil",
      type: "select",
      required: true,
      defaultValue: "crm",
      options: staffRoles.map(([value, label]) => ({ value, label })),
      admin: {
        position: "sidebar",
        description: "Complet : tout. CRM : /crm seulement (devis et factures en brouillon). Technicien : tickets Support seulement. Modifiable seulement par un gestionnaire des comptes, jamais sur son propre compte.",
      },
      access: {
        create: ({ req }) => canSetRights(req.user, null),
        update: ({ req, id, doc }) => canSetRights(req.user, id ?? doc?.id),
      },
    },
    {
      name: "mailAccess",
      label: "Messagerie contact@ (CRM)",
      type: "select",
      required: true,
      defaultValue: "none",
      options: mailLevels.map(([value, label]) => ({ value, label })),
      admin: {
        position: "sidebar",
        description: "Lecture, brouillons, envoi. Modifiable seulement par un gestionnaire des comptes, jamais sur son propre compte.",
      },
      access: {
        create: ({ req }) => canSetRights(req.user, null),
        update: ({ req, id, doc }) => canSetRights(req.user, id ?? doc?.id),
      },
    },
    {
      name: "manageAdmins",
      label: "Gère les comptes administrateurs",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Créer, modifier et supprimer les autres comptes et leurs droits. Indépendant du droit d’envoi.",
      },
      access: {
        create: ({ req }) => canSetRights(req.user, null),
        update: ({ req, id, doc }) => canSetRights(req.user, id ?? doc?.id),
      },
    },
  ],
};
export const Clients: CollectionConfig = {
  slug: "clients",
  labels: { singular: "Client", plural: "Clients" },
  admin: {
    useAsTitle: "name",
    group: group.support,
    description: "Entreprises clientes et prospects : utilisateurs, invitations et tickets sont gérés depuis la fiche ; le suivi commercial dans /crm.",
    defaultColumns: ["name", "stage", "city", "createdAt"],
    listSearchableFields: ["name", "email", "city", "sector"],
    hideAPIURL: true,
  },
  access: {
    create: crmOnly,
    read: ({ req }) => canUseCRM(req.user) || isTicketStaff(req.user),
    update: crmOnly,
    delete: crmOnly,
  },
  hooks: { beforeChange: [clientPipelineHook, searchHook(clientSearchFields)] },
  fields: [
    { name: "name", label: "Nom de l’entreprise", type: "text", required: true },
    ...clientCRMFields,
    {
      name: "workspace",
      type: "ui",
      admin: {
        condition: (data) => !!data?.id,
        components: { Field: "@/components/admin/ClientWorkspace#ClientWorkspace" },
      },
    },
  ],
};
export const ClientAccounts: CollectionConfig = {
  slug: "client-accounts",
  auth: {
    tokenExpiration: 3600,
    maxLoginAttempts: 5,
    lockTime: 900000,
    cookies: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    },
  },
  labels: { singular: "Utilisateur client", plural: "Utilisateurs clients" },
  admin: {
    // Full administrators only; other profiles keep their own account (/admin/account).
    hidden: ({ user }) => !isFullAdmin(user),
    useAsTitle: "email",
    group: group.support,
    description:
      "Personnes qui se connectent à l’espace Support. Pour inviter quelqu’un, ouvrir la fiche de son entreprise dans « Clients ».",
    defaultColumns: ["email", "name", "client", "enabled", "invitedAt"],
    hideAPIURL: true,
  },
  access: {
    admin: () => false,
    create: adminOnly,
    read: ({ req }) =>
      isTicketStaff(req.user)
        ? true
        : clientID(req.user) !== null
          ? { id: { equals: req.user!.id } }
          : false,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        // Payload first-register bypasses access.create; this hook closes that path.
        if (operation === "create" && !isAdmin(req.user))
          throw new Forbidden(req.t);
        if (data?.password && String(data.password).length < 14)
          throw new APIError(
            "Password must contain at least 14 characters",
            400,
          );
        return data;
      },
    ],
    beforeLogin: [
      ({ user }) => {
        if (!user.enabled) throw new Error("Account disabled");
        return user;
      },
    ],
  },
  fields: [
    { name: "name", label: "Nom", type: "text", required: true },
    {
      name: "client",
      label: "Entreprise",
      type: "relationship",
      relationTo: "clients",
      required: true,
      saveToJWT: true,
    },
    {
      name: "enabled",
      label: "Accès activé",
      type: "checkbox",
      defaultValue: false,
      saveToJWT: true,
      admin: { position: "sidebar" },
    },
    {
      name: "invitedAt",
      label: "Invité le",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "invitationHash",
      type: "text",
      index: true,
      admin: { hidden: true },
      access: { read: () => false },
    },
    {
      name: "invitationExpiresAt",
      label: "Invitation valable jusqu’au",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
      access: { read: ({ req }) => isTicketStaff(req.user) },
    },
  ],
};
const tenantField: Field = {
  name: "client",
  label: "Client",
  type: "relationship",
  relationTo: "clients",
  required: true,
  index: true,
  access: { update: ({ req }) => isTicketStaff(req.user) },
};
const authorField: Field = {
  name: "author",
  label: "Auteur",
  type: "relationship",
  relationTo: ["admins", "client-accounts"],
  required: true,
  access: { update: () => false },
  admin: { readOnly: true, position: "sidebar" },
};
const ticketField = (extra: object = {}): Field => ({
  name: "ticket",
  label: "Ticket",
  type: "relationship",
  relationTo: "tickets",
  required: true,
  ...extra,
});
export const Tickets: CollectionConfig = {
  slug: "tickets",
  labels: { singular: "Ticket", plural: "Tickets" },
  defaultSort: "-updatedAt",
  admin: {
    useAsTitle: "subject",
    group: group.support,
    defaultColumns: ["subject", "client", "priority", "status", "updatedAt"],
    listSearchableFields: ["subject", "description"],
    description:
      "Demandes ouvertes par les clients dans l’espace Support. Répondre au client ou ajouter une note interne en bas de chaque ticket.",
    hideAPIURL: true,
  },
  access: {
    create: clientOrAdmin,
    read: tenantRead,
    update: ticketStaffOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (operation === "create" && data) {
          const id = clientID(req.user);
          if (!isAdmin(req.user)) {
            if (id === null) throw new Error("Unauthorized");
            data.client = id;
            data.status = "open";
          }
          data.author = {
            relationTo: req.user!.collection,
            value: req.user!.id,
          };
        }
        return data;
      },
    ],
  },
  fields: [
    tenantField,
    authorField,
    { name: "subject", label: "Sujet", type: "text", required: true, maxLength: 180 },
    {
      name: "category",
      label: "Catégorie",
      type: "select",
      required: true,
      options: topics.map(([value, label]) => ({ value, label })),
    },
    {
      name: "priority",
      label: "Priorité",
      type: "select",
      required: true,
      defaultValue: "normal",
      index: true,
      options: ticketPriorities.map(([value, label]) => ({ value, label })),
      // Triage by the team only: a client never sets it (see lib/support.ts).
      access: { update: ({ req }) => isTicketStaff(req.user) },
      admin: { position: "sidebar", description: "Tri des tickets sur l’accueil du CRM." },
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      required: true,
      maxLength: 10000,
      admin: { rows: 8 },
    },
    {
      name: "thread",
      type: "ui",
      admin: {
        condition: (data) => !!data?.id,
        components: { Field: "@/components/admin/TicketThread#TicketThread" },
      },
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "open",
      options: [
        { label: "Ouvert", value: "open" },
        { label: "En cours", value: "in-progress" },
        { label: "En attente client", value: "waiting-client" },
        { label: "Résolu", value: "resolved" },
        { label: "Fermé", value: "closed" },
      ],
      access: {
        create: ({ req }) => isTicketStaff(req.user),
        update: ({ req }) => isTicketStaff(req.user),
      },
      admin: { position: "sidebar" },
    },
  ],
};
export const Replies: CollectionConfig = {
  slug: "ticket-replies",
  labels: { singular: "Réponse", plural: "Réponses" },
  defaultSort: "-createdAt",
  admin: {
    group: group.support,
    defaultColumns: ["ticket", "author", "message", "createdAt"],
    description: "Messages échangés avec le client, visibles par lui.",
    hideAPIURL: true,
  },
  access: {
    create: clientOrAdmin,
    read: tenantRead,
    update: ticketStaffOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (operation === "create" && data) {
          const id = relationID(data.ticket);
          if (id === null) throw new Error("Missing ticket");
          const ticket = await req.payload.findByID({
            collection: "tickets",
            id,
            req,
            overrideAccess: false,
            depth: 0,
          });
          data.client = ticket.client;
          data.author = {
            relationTo: req.user!.collection,
            value: req.user!.id,
          };
          if (!isAdmin(req.user) && ticket.status === "closed")
            throw new Error("Ticket closed");
        }
        return data;
      },
    ],
  },
  fields: [
    tenantField,
    ticketField({ index: true, access: { update: () => false } }),
    authorField,
    {
      name: "message",
      label: "Message",
      type: "textarea",
      required: true,
      maxLength: 10000,
      admin: { rows: 8 },
    },
  ],
};
export const Notes: CollectionConfig = {
  slug: "ticket-notes",
  labels: { singular: "Note interne", plural: "Notes internes" },
  defaultSort: "-createdAt",
  admin: {
    group: group.support,
    defaultColumns: ["ticket", "note", "createdAt"],
    description: "Notes réservées à l’équipe, jamais montrées au client.",
    hideAPIURL: true,
  },
  access: {
    create: ticketStaffOnly,
    read: ticketStaffOnly,
    update: ticketStaffOnly,
    delete: adminOnly,
  },
  fields: [
    ticketField(),
    {
      name: "note",
      label: "Note",
      type: "textarea",
      required: true,
      maxLength: 10000,
      admin: { rows: 6 },
    },
  ],
};
// Metadata only: binaries never use a Payload public upload collection.
export const Files: CollectionConfig = {
  slug: "ticket-files",
  labels: { singular: "Fichier joint", plural: "Fichiers joints" },
  defaultSort: "-createdAt",
  admin: {
    useAsTitle: "name",
    group: group.support,
    defaultColumns: ["name", "ticket", "client", "bytes", "createdAt"],
    description: "Pièces jointes des tickets (consultation et suppression seulement).",
    hideAPIURL: true,
  },
  access: {
    create: () => false,
    read: tenantRead,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    tenantField,
    ticketField({ index: true }),
    { name: "name", label: "Nom du fichier", type: "text", required: true },
    { name: "mime", label: "Type", type: "text", required: true },
    { name: "bytes", label: "Taille (octets)", type: "number", required: true },
    {
      name: "storageKey",
      type: "text",
      required: true,
      access: { read: ({ req }) => isTicketStaff(req.user) },
      admin: { hidden: true },
    },
  ],
};
const isAfricaMissionKey = (key: unknown) => typeof key === 'string' && /^africa-mission-(SEN|CIV|GIN|GNB|COD|COG)$/.test(key);
export const Pages: CollectionConfig = {
  slug: "pages",
  hooks: {
    // A blank space keeps older preproduction CMS validators compatible; public rendering trims it.
    beforeValidate: [({ data }) => {
      if (data?.copy) data.copy = data.copy.map((row: { key?: string; value?: string | null }) =>
        isAfricaMissionKey(row.key) && (row.value == null || (typeof row.value === 'string' && !row.value.trim()))
          ? { ...row, value: ' ' } : row);
      return data;
    }],
    afterChange: [
      ({ doc }) => {
        // Payload CLI seeds run outside Next's request cache context.
        try {
          revalidateTag("pages", { expire: 0 });
          revalidatePath(doc.slug === "home" ? "/" : "/" + doc.slug);
        } catch {}
        return doc;
      },
    ],
  },
  labels: { singular: "Page", plural: "Pages" },
  defaultSort: "title",
  admin: {
    // Full administrators only; other profiles keep their own account (/admin/account).
    hidden: ({ user }) => !isFullAdmin(user),
    useAsTitle: "title",
    group: group.site,
    defaultColumns: ["title", "slug", "updatedAt"],
    description:
      "Textes des pages du site. Chaque texte est repéré par sa clé ; modifier seulement la valeur.",
    hideAPIURL: true,
  },
  access: {
    read: () => true,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: "slug",
      label: "Adresse (/…)",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar", readOnly: true },
    },
    { name: "title", label: "Titre de l’onglet (SEO)", type: "text", required: true },
    {
      name: "copy",
      label: "Textes de la page",
      type: "array",
      labels: { singular: "Texte", plural: "Textes" },
      admin: {
        initCollapsed: true,
        components: { RowLabel: "@/components/admin/CopyRowLabel#CopyRowLabel" },
      },
      fields: [
        {
          name: "key",
          label: "Clé (ne pas modifier)",
          type: "text",
          required: true,
          admin: { readOnly: true },
        },
        { name: "value", label: "Texte affiché", type: "textarea",
          validate: (value, { siblingData }) => (isAfricaMissionKey((siblingData as { key?: unknown })?.key)
            ? (value == null || typeof value === 'string')
            : (typeof value === 'string' && value.length > 0))
            || 'Ce texte est obligatoire. Seules les missions par pays peuvent rester vides.',
          admin: { description: 'Mission Afrique : laisser vide pour ne rien afficher. Les autres textes sont obligatoires.' },
        },
      ],
    },
  ],
};
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Image", plural: "Médiathèque" },
  admin: {
    // Full administrators only; other profiles keep their own account (/admin/account).
    hidden: ({ user }) => !isFullAdmin(user),
    group: group.site,
    defaultColumns: ["filename", "alt", "updatedAt"],
    description: "Logos et visuels utilisés par les réalisations.",
    hideAPIURL: true,
  },
  upload: {
    staticDir: process.env.MEDIA_STORAGE_PATH || path.resolve("storage/media"),
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  access: {
    read: () => true,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: "alt",
      label: "Texte alternatif (description de l’image)",
      type: "text",
      required: true,
    },
  ],
};
// Projects and case studies feed the home page and /realisations.
const refreshShowcase = () => {
  try {
    revalidateTag("showcase", { expire: 0 });
    revalidatePath("/");
    revalidatePath("/realisations");
  } catch {}
};
const showcaseHooks = {
  afterChange: [({ doc }: { doc: unknown }) => (refreshShowcase(), doc)],
  afterDelete: [({ doc }: { doc: unknown }) => (refreshShowcase(), doc)],
};
const publicReadAdminWrite = {
  read: () => true,
  create: adminOnly,
  update: adminOnly,
  delete: adminOnly,
};
const orderField: Field = {
  name: "order",
  label: "Ordre d’affichage (plus petit = en premier)",
  type: "number",
  defaultValue: 0,
  admin: { position: "sidebar" },
};
const publishedField: Field = {
  name: "published",
  label: "Publié sur le site",
  type: "checkbox",
  defaultValue: true,
  admin: { position: "sidebar" },
};
export const Projects: CollectionConfig = {
  slug: "projects",
  labels: { singular: "Projet", plural: "Projets (réalisations)" },
  defaultSort: "order",
  admin: {
    // Full administrators only; other profiles keep their own account (/admin/account).
    hidden: ({ user }) => !isFullAdmin(user),
    useAsTitle: "name",
    group: group.site,
    hideAPIURL: true,
    defaultColumns: ["name", "country", "status", "order", "published"],
    description:
      "Cartes « Nos réalisations et projets » de l’accueil et de /realisations.",
  },
  access: publicReadAdminWrite,
  hooks: showcaseHooks,
  fields: [
    { name: "name", label: "Client / projet", type: "text", required: true, maxLength: 80 },
    { name: "country", label: "Pays", type: "text", required: true, maxLength: 40 },
    { name: "mission", label: "Mission", type: "textarea", required: true, maxLength: 200 },
    {
      name: "status",
      label: "Statut",
      type: "select",
      required: true,
      defaultValue: "completed",
      options: projectStatuses,
    },
    {
      name: "logo",
      label: "Logo (image PNG, JPEG ou WebP)",
      type: "upload",
      relationTo: "media",
      admin: { description: "Prioritaire sur le logo fourni avec le site." },
    },
    {
      name: "builtinLogo",
      label: "Ou logo fourni avec le site",
      type: "select",
      options: builtinLogoOptions,
      admin: { description: "Sans logo : le nom s’affiche en texte." },
    },
    orderField,
    publishedField,
    {
      name: "showOnHome",
      label: "Afficher aussi sur l’accueil",
      type: "checkbox",
      defaultValue: true,
      admin: { position: "sidebar" },
    },
  ],
};
export const CaseStudies: CollectionConfig = {
  slug: "case-studies",
  labels: { singular: "Étude de cas", plural: "Études de cas" },
  defaultSort: "order",
  admin: {
    // Full administrators only; other profiles keep their own account (/admin/account).
    hidden: ({ user }) => !isFullAdmin(user),
    useAsTitle: "client",
    group: group.site,
    hideAPIURL: true,
    defaultColumns: ["client", "project", "order", "published"],
    description: "Blocs détaillés avec visuel de la page /realisations.",
  },
  access: publicReadAdminWrite,
  hooks: showcaseHooks,
  fields: [
    { name: "client", label: "Client", type: "text", required: true, maxLength: 80 },
    { name: "category", label: "Catégorie (petit titre)", type: "text", maxLength: 40 },
    { name: "project", label: "Projet", type: "text", required: true, maxLength: 80 },
    { name: "summary", label: "Description", type: "textarea", required: true, maxLength: 600 },
    {
      name: "tags",
      label: "Étiquettes",
      type: "array",
      maxRows: 6,
      labels: { singular: "Étiquette", plural: "Étiquettes" },
      fields: [{ name: "label", label: "Texte", type: "text", required: true, maxLength: 40 }],
    },
    {
      name: "image",
      label: "Visuel (image PNG, JPEG ou WebP)",
      type: "upload",
      relationTo: "media",
      admin: { description: "Prioritaire sur l’illustration fournie." },
    },
    {
      name: "illustration",
      label: "Ou illustration fournie avec le site",
      type: "select",
      options: builtinIllustrationOptions,
    },
    {
      name: "anchor",
      label: "Ancre de lien (/realisations#…)",
      type: "text",
      required: true,
      unique: true,
      maxLength: 60,
      validate: (value: unknown) =>
        /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(value ?? "")) ||
        "Minuscules, chiffres et tirets uniquement (ex. groupe-hage).",
      admin: { position: "sidebar" },
    },
    orderField,
    publishedField,
  ],
};
export const SocialLinks: GlobalConfig = {
  slug: "social-links",
  label: "Réseaux sociaux",
  admin: {
    // Full administrators only; other profiles keep their own account (/admin/account).
    hidden: ({ user }) => !isFullAdmin(user), group: group.site, hideAPIURL: true },
  access: { read: () => true, update: adminOnly },
  hooks: {
    afterChange: [
      ({ doc }) => {
        // The footer is on every page: refresh the whole site layout.
        try {
          revalidateTag("social", { expire: 0 });
          revalidatePath("/", "layout");
        } catch {}
        return doc;
      },
    ],
  },
  fields: [
    {
      name: "links",
      label: "Liens affichés dans le pied de page",
      type: "array",
      maxRows: 8,
      labels: { singular: "Réseau", plural: "Réseaux" },
      fields: [
        {
          name: "platform",
          label: "Réseau",
          type: "select",
          required: true,
          options: socialPlatforms,
        },
        {
          name: "url",
          label: "Adresse de la page (https://…)",
          type: "text",
          required: true,
          maxLength: 300,
          validate: (value: unknown) =>
            isSocialURL(value) || "Adresse complète en https:// requise.",
        },
      ],
    },
  ],
};
export const Contacts: CollectionConfig = {
  slug: "contact-requests",
  labels: { singular: "Demande de contact", plural: "Demandes de contact" },
  defaultSort: "-createdAt",
  admin: {
    useAsTitle: "name",
    group: group.inbox,
    defaultColumns: ["name", "company", "topicLabel", "serviceLabel", "email", "createdAt"],
    listSearchableFields: ["name", "company", "email", "message"],
    description:
      "Messages reçus par le formulaire Contact du site. Lecture seule : répondre par email ou téléphone.",
    hideAPIURL: true,
  },
  access: {
    read: crmOnly,
    create: () => false,
    update: adminOnly,
    delete: adminOnly,
  },
  // Submitted by visitors and the mail worker: never edited in the admin.
  fields: privateFields([
    {
      name: "actions",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "@/components/admin/ContactActions#ContactActions" },
      },
    },
    {
      type: "row",
      fields: [
        { name: "name", label: "Nom", type: "text", required: true, admin: { readOnly: true } },
        { name: "company", label: "Entreprise", type: "text", admin: { readOnly: true } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "email", label: "Email", type: "email", required: true, admin: { readOnly: true } },
        { name: "phone", label: "Téléphone", type: "text", admin: { readOnly: true } },
      ],
    },
    { name: "topic", type: "text", required: true, admin: { hidden: true } },
    // Service page the visitor was reading when they wrote, when they came from one.
    { name: "service", type: "text", admin: { hidden: true } },
    {
      name: "serviceLabel",
      label: "Page consultée",
      type: "text",
      virtual: true,
      admin: { readOnly: true, description: "Service consulté avant l’envoi du formulaire." },
      hooks: { afterRead: [({ siblingData }) => serviceLabel(siblingData?.service) || "—"] },
    },
    {
      name: "topicLabel",
      label: "Sujet",
      type: "text",
      virtual: true,
      admin: { readOnly: true },
      hooks: { afterRead: [({ siblingData }) => topicLabel(siblingData?.topic)] },
    },
    {
      name: "message",
      label: "Message",
      type: "textarea",
      required: true,
      admin: { readOnly: true, rows: 10 },
    },
    {
      name: "notification",
      label: "Alerte email à l’équipe",
      type: "select",
      defaultValue: "not-configured",
      admin: { position: "sidebar", readOnly: true },
      options: [{label:"Non configurée",value:"not-configured"},{label:"En attente",value:"pending"},{label:"Acceptée par SMTP (livraison non confirmée)",value:"sent"},{label:"Échec ou résultat SMTP incertain",value:"failed"}],
    },
  ]),
};
