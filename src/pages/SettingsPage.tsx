import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, resources } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "./PigsPage";

type SettingsResponse = {
  business: {
    businessName: string;
    currency: string;
    timezone: string;
    piggery?: { name?: string; address?: string };
    karenderiya?: { name?: string; address?: string };
    settings?: {
      inventoryValuationMethod?: string;
      generalExpenseAllocation?: string;
      defaultTargetFoodCostPercent?: number | string;
      meatTransferPricingMethod?: string;
    };
  };
  user: { name: string; email: string; phone: string; emailVerifiedAt?: string };
  slaughter?: SlaughterSetting;
};
type SlaughterSetting = {
  name: string;
  costItems: CostItem[];
  meatParts: MeatPart[];
};
type CostItem = {
  code: string;
  name: string;
  calculationMethod: string;
  defaultRate: number;
  isActive: boolean;
};
type MeatPart = {
  code: string;
  name: string;
  classification: string;
  defaultExternalPricePerKg: number;
  defaultKarenderiyaPricePerKg: number;
  isUsableForCooking: boolean;
  isActive: boolean;
};
type Contact = {
  _id: string;
  contactCode: string;
  name: string;
  types: string[];
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
};

const initialCosts: CostItem[] = [
  {
    code: "SLAUGHTER",
    name: "Slaughter fee",
    calculationMethod: "FLAT",
    defaultRate: 0,
    isActive: true,
  },
  {
    code: "BUTCHER",
    name: "Butcher / cutting",
    calculationMethod: "FLAT",
    defaultRate: 0,
    isActive: true,
  },
  {
    code: "TRANSPORT",
    name: "Transport",
    calculationMethod: "FLAT",
    defaultRate: 0,
    isActive: true,
  },
];
const initialParts: MeatPart[] = [
  "Belly / Liempo",
  "Shoulder / Kasim",
  "Ham / Pigue",
  "Loin / Lomo",
  "Ribs",
  "Head",
  "Legs / Pata",
  "Offal",
  "Fat",
  "Bones",
].map((name, index) => ({
  code: `PART-${index + 1}`,
  name,
  classification: name === "Bones" ? "BYPRODUCT" : "MEAT",
  defaultExternalPricePerKg: 0,
  defaultKarenderiyaPricePerKg: 0,
  isUsableForCooking: name !== "Bones",
  isActive: true,
}));

export function SettingsPage() {
  const client = useQueryClient();
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact>();
  const [costs, setCosts] = useState(initialCosts);
  const [parts, setParts] = useState(initialParts);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsResponse>("/settings"),
  });
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => resources.list<Contact>("contacts", "?limit=100&sort=name"),
  });

  useEffect(() => {
    if (settings.data?.slaughter) {
      setCosts(
        settings.data.slaughter.costItems.map((item) => ({
          ...item,
          defaultRate: Number(item.defaultRate),
        })),
      );
      setParts(
        settings.data.slaughter.meatParts.map((item) => ({
          ...item,
          defaultExternalPricePerKg: Number(item.defaultExternalPricePerKg),
          defaultKarenderiyaPricePerKg: Number(item.defaultKarenderiyaPricePerKg),
        })),
      );
    }
  }, [settings.data?.slaughter]);

  const saveBusiness = useMutation({
    mutationFn: (payload: unknown) =>
      api("/settings/business", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Business settings saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const saveSlaughter = useMutation({
    mutationFn: () =>
      api("/settings/slaughter", {
        method: "PUT",
        body: JSON.stringify({
          name: "Default slaughter setup",
          costItems: costs,
          meatParts: parts,
        }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Slaughter defaults saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const saveContact = useMutation({
    mutationFn: (payload: unknown) =>
      editingContact
        ? resources.update("contacts", editingContact._id, payload)
        : resources.create("contacts", payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["contacts"] });
      setContactOpen(false);
      setEditingContact(undefined);
      toast.success(editingContact ? "Contact updated" : "Contact added");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeContact = useMutation({
    mutationFn: (id: string) => resources.remove("contacts", id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  if (settings.isLoading || contacts.isLoading) return <PageSkeleton />;
  if (settings.isError)
    return <QueryError message={settings.error.message} retry={() => settings.refetch()} />;
  const data = settings.data;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Header
        title="Settings"
        description="Owner profile, business defaults, contacts, and slaughter pricing in Philippine pesos."
      />
      <Tabs defaultValue="business">
        <TabsList className="h-auto grid-cols-3 gap-1">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="slaughter">Slaughter defaults</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>
        <TabsContent value="business" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Owner and business profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = Object.fromEntries(new FormData(event.currentTarget));
                  saveBusiness.mutate({
                    ...form,
                    defaultTargetFoodCostPercent: Number(form.defaultTargetFoodCostPercent),
                  });
                }}
              >
                <Field label="Owner name">
                  <Input name="ownerName" defaultValue={data.user.name} required />
                </Field>
                <Field label="Business name">
                  <Input name="businessName" defaultValue={data.business.businessName} required />
                </Field>
                <Field label="Piggery name">
                  <Input name="piggeryName" defaultValue={data.business.piggery?.name} required />
                </Field>
                <Field label="Piggery address">
                  <Input name="piggeryAddress" defaultValue={data.business.piggery?.address} />
                </Field>
                <Field label="Karenderiya name">
                  <Input
                    name="karenderiyaName"
                    defaultValue={data.business.karenderiya?.name}
                    required
                  />
                </Field>
                <Field label="Karenderiya address">
                  <Input
                    name="karenderiyaAddress"
                    defaultValue={data.business.karenderiya?.address}
                  />
                </Field>
                <Field label="Inventory valuation">
                  <OwnerSelect
                    name="inventoryValuationMethod"
                    value={data.business.settings?.inventoryValuationMethod ?? "FIFO"}
                    options={["FIFO", "WEIGHTED_AVERAGE"]}
                  />
                </Field>
                <Field label="General expense allocation">
                  <OwnerSelect
                    name="generalExpenseAllocation"
                    value={data.business.settings?.generalExpenseAllocation ?? "GENERAL_ONLY"}
                    options={["GENERAL_ONLY", "EQUAL_PER_ACTIVE_PIG", "MANUAL"]}
                  />
                </Field>
                <Field label="Default food cost target (%)">
                  <Input
                    name="defaultTargetFoodCostPercent"
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={Number(
                      data.business.settings?.defaultTargetFoodCostPercent ?? 35,
                    )}
                    required
                  />
                </Field>
                <Field label="Meat transfer pricing">
                  <OwnerSelect
                    name="meatTransferPricingMethod"
                    value={data.business.settings?.meatTransferPricingMethod ?? "PRODUCTION_COST"}
                    options={["PRODUCTION_COST", "OWNER_SET_PRICE"]}
                  />
                </Field>
                <div className="sm:col-span-2 rounded-xl bg-pink-50 p-4 text-sm text-stone-600">
                  <p>
                    <strong>Email:</strong> {data.user.email}{" "}
                    {data.user.emailVerifiedAt && <Badge tone="green">VERIFIED</Badge>}
                  </p>
                  <p className="mt-1">
                    <strong>Phone:</strong> {data.user.phone}
                  </p>
                  <p className="mt-1">
                    <strong>Currency / timezone:</strong> {data.business.currency} ·{" "}
                    {data.business.timezone}
                  </p>
                </div>
                <Button className="sm:col-span-2" disabled={saveBusiness.isPending}>
                  Save business settings
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="slaughter" className="mt-5 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Default slaughter costs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {costs.map((cost, index) => (
                <div
                  key={cost.code}
                  className="grid gap-3 rounded-xl bg-stone-50 p-3 sm:grid-cols-[1fr_210px_150px]"
                >
                  <Input
                    value={cost.name}
                    onChange={(event) =>
                      setCosts(
                        costs.map((item, i) =>
                          i === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Select
                    value={cost.calculationMethod}
                    onValueChange={(value) =>
                      setCosts(
                        costs.map((item, i) =>
                          i === index ? { ...item, calculationMethod: value } : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["FLAT", "PER_LIVE_KG", "PER_CARCASS_KG", "MANUAL"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${cost.name} default rate`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost.defaultRate}
                    onChange={(event) =>
                      setCosts(
                        costs.map((item, i) =>
                          i === index ? { ...item, defaultRate: Number(event.target.value) } : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Default meat parts and prices per kg</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {parts.map((part, index) => (
                <div
                  key={part.code}
                  className="grid gap-3 rounded-xl bg-stone-50 p-3 sm:grid-cols-[1fr_150px_150px_150px]"
                >
                  <Input
                    value={part.name}
                    onChange={(event) =>
                      setParts(
                        parts.map((item, i) =>
                          i === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Select
                    value={part.classification}
                    onValueChange={(value) =>
                      setParts(
                        parts.map((item, i) =>
                          i === index ? { ...item, classification: value } : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["MEAT", "BYPRODUCT", "WASTE"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${part.name} selling price`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={part.defaultExternalPricePerKg}
                    onChange={(event) =>
                      setParts(
                        parts.map((item, i) =>
                          i === index
                            ? { ...item, defaultExternalPricePerKg: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    placeholder="Sell / kg"
                  />
                  <Input
                    aria-label={`${part.name} transfer price`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={part.defaultKarenderiyaPricePerKg}
                    onChange={(event) =>
                      setParts(
                        parts.map((item, i) =>
                          i === index
                            ? { ...item, defaultKarenderiyaPricePerKg: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    placeholder="Transfer / kg"
                  />
                </div>
              ))}
              <Button
                className="w-full"
                onClick={() => saveSlaughter.mutate()}
                disabled={saveSlaughter.isPending}
              >
                Save slaughter defaults
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="contacts" className="mt-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Suppliers, buyers, and service contacts</CardTitle>
              <Button
                onClick={() => {
                  setEditingContact(undefined);
                  setContactOpen(true);
                }}
              >
                <Icon icon="solar:add-circle-linear" /> Add contact
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-stone-400">
                  <tr>
                    <th className="py-3">Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Phone</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.data?.items.map((contact) => (
                    <tr key={contact._id}>
                      <td className="py-4">{contact.contactCode}</td>
                      <td className="font-semibold">{contact.name}</td>
                      <td>{contact.types.join(", ")}</td>
                      <td>{contact.phone || "—"}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingContact(contact);
                              setContactOpen(true);
                            }}
                          >
                            <Icon icon="solar:pen-linear" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() =>
                              window.confirm(`Delete ${contact.name}?`) &&
                              removeContact.mutate(contact._id)
                            }
                          >
                            <Icon icon="solar:trash-bin-trash-linear" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!contacts.data?.items.length && (
                <p className="py-10 text-center text-sm text-stone-400">No contacts yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog
        open={contactOpen}
        onOpenChange={(open) => {
          setContactOpen(open);
          if (!open) setEditingContact(undefined);
        }}
      >
        <DialogContent key={editingContact?._id ?? "new"}>
          <DialogTitle>{editingContact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription>
            Keep supplier, buyer, butcher, and slaughterhouse details reusable.
          </DialogDescription>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = Object.fromEntries(new FormData(event.currentTarget));
              saveContact.mutate({ ...form, types: [form.type], isActive: true });
            }}
          >
            <Field label="Contact code">
              <Input
                name="contactCode"
                defaultValue={
                  editingContact?.contactCode ?? `CNT-${Date.now().toString().slice(-6)}`
                }
                required
              />
            </Field>
            <Field label="Name">
              <Input name="name" defaultValue={editingContact?.name} required />
            </Field>
            <Field label="Type">
              <OwnerSelect
                name="type"
                value={editingContact?.types[0] ?? "SUPPLIER"}
                options={[
                  "SUPPLIER",
                  "BUYER",
                  "VETERINARIAN",
                  "BUTCHER",
                  "SLAUGHTERHOUSE",
                  "OTHER",
                ]}
              />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={editingContact?.phone} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={editingContact?.email} />
            </Field>
            <Field label="Address">
              <Input name="address" defaultValue={editingContact?.address} />
            </Field>
            <Button className="sm:col-span-2" disabled={saveContact.isPending}>
              {editingContact ? "Update contact" : "Save contact"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function OwnerSelect({ name, value, options }: { name: string; value: string; options: string[] }) {
  return (
    <Select name={name} defaultValue={value}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
