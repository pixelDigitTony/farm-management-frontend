import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, sessionUserStore } from "@/api/client";
import { QueryError } from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CalendarTodo } from "@/types/domain";
import { Header } from "./PigsPage";

type CalendarUser = { _id: string; name: string; role: number };
type TodoPayload = {
  title: string;
  notes: string;
  calendarDate: string;
  startTime: string | null;
  category: CalendarTodo["category"];
  priority: CalendarTodo["priority"];
  assignedToUserId: string | null;
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const categories: Array<CalendarTodo["category"]> = ["GENERAL", "FARM", "KARENDERIYA"];
const priorities: Array<CalendarTodo["priority"]> = ["LOW", "NORMAL", "HIGH"];
const statuses: Array<CalendarTodo["status"]> = ["PENDING", "IN_PROGRESS", "COMPLETED"];

const categoryStyle: Record<CalendarTodo["category"], string> = {
  GENERAL: "bg-stone-100 text-stone-700",
  FARM: "bg-amber-100 text-amber-800",
  KARENDERIYA: "bg-pink-100 text-pink-800",
};
const priorityStyle: Record<CalendarTodo["priority"], string> = {
  LOW: "bg-sky-100 text-sky-700",
  NORMAL: "bg-violet-100 text-violet-700",
  HIGH: "bg-red-100 text-red-700",
};

function localDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function text(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function CalendarTodosPage() {
  const client = useQueryClient();
  const user = sessionUserStore.get();
  const today = localDate(new Date());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(today);
  const [mine, setMine] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | CalendarTodo["status"]>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CalendarTodo["category"]>("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarTodo>();
  const [deleting, setDeleting] = useState<CalendarTodo>();

  const firstDay = startOfWeek(startOfMonth(month));
  const lastDay = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });
  const query = new URLSearchParams({
    start: localDate(firstDay),
    end: localDate(lastDay),
    mine: String(mine),
  });
  const todos = useQuery({
    queryKey: ["calendar-todos", query.toString()],
    queryFn: () => api<{ items: CalendarTodo[] }>(`/calendar-todos?${query.toString()}`),
  });
  const users = useQuery({
    queryKey: ["calendar-todo-users"],
    queryFn: () => api<{ items: CalendarUser[] }>("/calendar-todos/users"),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["calendar-todos"] });
  const save = useMutation({
    mutationFn: (payload: TodoPayload) =>
      api(editing ? `/calendar-todos/${editing._id}` : "/calendar-todos", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setEditing(undefined);
      toast.success(editing ? "To-do updated" : "To-do added to the calendar");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStatus = useMutation({
    mutationFn: ({ todo, status }: { todo: CalendarTodo; status: CalendarTodo["status"] }) =>
      api(`/calendar-todos/${todo._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      refresh();
      toast.success("To-do status updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (todo: CalendarTodo) => api(`/calendar-todos/${todo._id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      setDeleting(undefined);
      toast.success("To-do deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const visibleTodos = useMemo(
    () =>
      (todos.data?.items ?? []).filter(
        (todo) =>
          (statusFilter === "ALL" || todo.status === statusFilter) &&
          (categoryFilter === "ALL" || todo.category === categoryFilter),
      ),
    [todos.data?.items, statusFilter, categoryFilter],
  );
  const selectedTodos = visibleTodos.filter((todo) => todo.calendarDate === selectedDate);
  const todosByDate = new Map<string, CalendarTodo[]>();
  for (const todo of visibleTodos) {
    const tasks = todosByDate.get(todo.calendarDate) ?? [];
    tasks.push(todo);
    todosByDate.set(todo.calendarDate, tasks);
  }
  const names = new Map((users.data?.items ?? []).map((item) => [item._id, item.name]));
  const canManage = (todo: CalendarTodo) =>
    todo.createdByUserId === user?.id || Boolean(user?.isHighestRole);
  const canUpdateStatus = (todo: CalendarTodo) =>
    canManage(todo) || todo.assignedToUserId === user?.id;

  function startCreate(date = selectedDate) {
    setEditing(undefined);
    setSelectedDate(date);
    setOpen(true);
  }
  function startEdit(todo: CalendarTodo) {
    setEditing(todo);
    setOpen(true);
  }
  function changeMonth(nextMonth: Date) {
    setMonth(nextMonth);
    setSelectedDate(localDate(nextMonth));
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    save.mutate({
      title: String(values.title).trim(),
      notes: String(values.notes ?? "").trim(),
      calendarDate: String(values.calendarDate),
      startTime: values.startTime ? String(values.startTime) : null,
      category: String(values.category) as CalendarTodo["category"],
      priority: String(values.priority) as CalendarTodo["priority"],
      assignedToUserId: values.assignedToUserId ? String(values.assignedToUserId) : null,
    });
  }

  if (todos.isLoading || users.isLoading) return <PageSkeleton cards={6} />;
  const error = todos.isError ? todos.error : users.isError ? users.error : null;
  if (error) return <QueryError message={error.message} retry={() => void todos.refetch()} />;

  return (
    <div className="space-y-6">
      <Header
        title="Calendar & To-do"
        description="Plan farm and karenderiya work together, then mark each task done from the calendar."
      >
        <Button onClick={() => startCreate()}>
          <Icon icon="solar:add-circle-linear" /> Add to-do
        </Button>
      </Header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
          <label className="flex items-center gap-2 rounded-xl border border-pink-100 bg-pink-50/50 px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={mine}
              onChange={(event) => setMine(event.target.checked)}
              className="size-4 accent-pink-700"
            />
            Mine only
          </label>
          <Filter
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={["ALL", ...statuses]}
          />
          <Filter
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={["ALL", ...categories]}
          />
          <Button
            variant="outline"
            className="ml-auto"
            disabled={!mine && statusFilter === "ALL" && categoryFilter === "ALL"}
            onClick={() => {
              setMine(false);
              setStatusFilter("ALL");
              setCategoryFilter("ALL");
            }}
          >
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.8fr)]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-pink-100 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-display text-xl font-semibold">{format(month, "MMMM yyyy")}</h2>
                <p className="text-sm text-stone-500">
                  {visibleTodos.length} scheduled to-do{visibleTodos.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => changeMonth(subMonths(month, 1))}
                >
                  <Icon icon="solar:alt-arrow-left-linear" className="size-5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changeMonth(startOfMonth(new Date()))}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => changeMonth(addMonths(month, 1))}
                >
                  <Icon icon="solar:alt-arrow-right-linear" className="size-5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b border-pink-100 bg-pink-50/45">
              {weekDays.map((day) => (
                <p
                  key={day}
                  className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-[.15em] text-stone-500 sm:text-xs"
                >
                  {day}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const date = localDate(day);
                const tasks = todosByDate.get(date) ?? [];
                const selected = date === selectedDate;
                return (
                  <div
                    key={date}
                    className={cn(
                      "group relative min-h-28 border-b border-r border-pink-100 p-2 text-left transition hover:bg-pink-50/60 focus-within:ring-2 focus-within:ring-inset focus-within:ring-pink-400 sm:min-h-32 sm:p-3",
                      !isSameMonth(day, month) && "bg-stone-50/70 text-stone-400",
                      selected && "bg-pink-50 ring-2 ring-inset ring-pink-400",
                    )}
                  >
                    <button
                      type="button"
                      className="absolute inset-0"
                      aria-label={`Select ${format(day, "MMMM d")}`}
                      onClick={() => setSelectedDate(date)}
                    />
                    <div className="pointer-events-none relative">
                      <span
                        className={cn(
                          "grid size-7 place-items-center rounded-full text-sm font-semibold",
                          isSameDay(day, new Date()) && "bg-pink-700 text-white",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="mt-1.5 space-y-1">
                        {tasks.slice(0, 2).map((todo) => (
                          <p
                            key={todo._id}
                            className={cn(
                              "truncate rounded-md px-1.5 py-1 text-[10px] font-semibold sm:text-xs",
                              categoryStyle[todo.category],
                              todo.status === "COMPLETED" && "opacity-55 line-through",
                            )}
                          >
                            {todo.startTime ? `${todo.startTime} ` : ""}
                            {todo.title}
                          </p>
                        ))}
                        {tasks.length > 2 ? (
                          <p className="px-1 text-[10px] font-semibold text-stone-500">
                            +{tasks.length - 2} more
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Add to-do on ${format(day, "MMMM d")}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        startCreate(date);
                      }}
                      className="relative mt-1 hidden size-6 place-items-center rounded-lg text-pink-700 hover:bg-pink-100 group-hover:grid focus:grid"
                    >
                      <Icon icon="solar:add-circle-linear" className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.15em] text-pink-700">
                  Selected day
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold">
                  {format(new Date(`${selectedDate}T00:00:00`), "EEEE, MMM d")}
                </h2>
              </div>
              <Button variant="outline" size="sm" onClick={() => startCreate(selectedDate)}>
                <Icon icon="solar:add-circle-linear" /> Add
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {selectedTodos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 p-6 text-center">
                  <Icon
                    icon="solar:calendar-minimalistic-linear"
                    className="mx-auto size-7 text-pink-600"
                  />
                  <p className="mt-2 text-sm font-semibold">Nothing planned yet</p>
                  <p className="mt-1 text-xs text-stone-500">
                    Add a task for this date to keep the work moving.
                  </p>
                </div>
              ) : (
                selectedTodos.map((todo) => (
                  <TodoCard
                    key={todo._id}
                    todo={todo}
                    assignee={todo.assignedToUserId ? names.get(todo.assignedToUserId) : undefined}
                    canManage={canManage(todo)}
                    canUpdateStatus={canUpdateStatus(todo)}
                    pending={updateStatus.isPending || remove.isPending}
                    onEdit={() => startEdit(todo)}
                    onDelete={() => setDeleting(todo)}
                    onStatus={(status) => updateStatus.mutate({ todo, status })}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <TodoDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(undefined);
        }}
        todo={editing}
        selectedDate={selectedDate}
        users={users.data?.items ?? []}
        pending={save.isPending}
        onSubmit={submit}
      />
      <DeleteDialog
        todo={deleting}
        pending={remove.isPending}
        onOpenChange={(next) => !next && setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function Filter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: T[];
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-stone-500">
      {label}
      <select
        className="h-10 rounded-xl border border-pink-100 bg-white px-3 text-sm font-medium text-stone-800"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "ALL" ? `All ${label.toLowerCase()}es` : text(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TodoCard({
  todo,
  assignee,
  canManage,
  canUpdateStatus,
  pending,
  onEdit,
  onDelete,
  onStatus,
}: {
  todo: CalendarTodo;
  assignee?: string;
  canManage: boolean;
  canUpdateStatus: boolean;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: CalendarTodo["status"]) => void;
}) {
  const overdue = todo.calendarDate < localDate(new Date()) && todo.status !== "COMPLETED";
  return (
    <article
      className={cn(
        "rounded-2xl border p-4",
        overdue ? "border-red-200 bg-red-50/40" : "border-pink-100 bg-white",
      )}
    >
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!canUpdateStatus || pending}
          aria-label={todo.status === "COMPLETED" ? "Reopen to-do" : "Complete to-do"}
          onClick={() => onStatus(todo.status === "COMPLETED" ? "PENDING" : "COMPLETED")}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
            todo.status === "COMPLETED"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-pink-300 text-transparent hover:border-pink-700",
          )}
        >
          {todo.status === "COMPLETED" ? (
            <Icon icon="solar:check-read-linear" className="size-4" />
          ) : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className={cn(
                  "font-semibold",
                  todo.status === "COMPLETED" && "text-stone-500 line-through",
                )}
              >
                {todo.title}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {todo.startTime ? `${todo.startTime} · ` : ""}
                {assignee ? `Assigned to ${assignee}` : "Unassigned"}
              </p>
            </div>
            {canManage ? (
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" aria-label="Edit to-do" onClick={onEdit}>
                  <Icon icon="solar:pen-new-square-linear" className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete to-do" onClick={onDelete}>
                  <Icon icon="solar:trash-bin-trash-linear" className="size-4 text-red-600" />
                </Button>
              </div>
            ) : null}
          </div>
          {todo.notes ? (
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{todo.notes}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge className={categoryStyle[todo.category]}>{text(todo.category)}</Badge>
            <Badge className={priorityStyle[todo.priority]}>{text(todo.priority)}</Badge>
            {overdue ? <Badge className="bg-red-100 text-red-700">Overdue</Badge> : null}
            {canUpdateStatus && todo.status !== "COMPLETED" ? (
              <button
                type="button"
                disabled={pending}
                className="ml-auto text-xs font-semibold text-pink-700 hover:text-pink-900"
                onClick={() => onStatus(todo.status === "PENDING" ? "IN_PROGRESS" : "PENDING")}
              >
                {todo.status === "PENDING" ? "Start task" : "Mark pending"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function TodoDialog({
  open,
  onOpenChange,
  todo,
  selectedDate,
  users,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: CalendarTodo;
  selectedDate: string;
  users: CalendarUser[];
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{todo ? "Edit to-do" : "Add to-do"}</DialogTitle>
        <DialogDescription>
          {todo
            ? "Update the details for this calendar task."
            : "Add a focused task to your business calendar."}
        </DialogDescription>
        <form key={todo?._id ?? selectedDate} className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <Label>Title</Label>
            <Input
              name="title"
              required
              maxLength={120}
              defaultValue={todo?.title}
              placeholder="e.g. Check pig feed stock"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              name="notes"
              maxLength={1000}
              defaultValue={todo?.notes ?? ""}
              placeholder="Optional details"
              className="min-h-24 w-full rounded-xl border border-pink-100 p-3 text-sm outline-none focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Date</Label>
              <Input
                name="calendarDate"
                type="date"
                required
                defaultValue={todo?.calendarDate ?? selectedDate}
              />
            </div>
            <div>
              <Label>Start time</Label>
              <Input name="startTime" type="time" defaultValue={todo?.startTime ?? ""} />
            </div>
            <div>
              <Label>Category</Label>
              <select
                name="category"
                defaultValue={todo?.category ?? "GENERAL"}
                className="h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm"
              >
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {text(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Priority</Label>
              <select
                name="priority"
                defaultValue={todo?.priority ?? "NORMAL"}
                className="h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm"
              >
                {priorities.map((value) => (
                  <option key={value} value={value}>
                    {text(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>Assign to</Label>
            <select
              name="assignedToUserId"
              defaultValue={todo?.assignedToUserId ?? ""}
              className="h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={pending}>
              {pending ? "Saving…" : todo ? "Save changes" : "Add to-do"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  todo,
  pending,
  onOpenChange,
  onConfirm,
}: {
  todo?: CalendarTodo;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(todo)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Delete this to-do?</DialogTitle>
        <DialogDescription>
          {todo ? `“${todo.title}” will be removed from the business calendar.` : ""}
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} className="bg-red-600 hover:bg-red-700" onClick={onConfirm}>
            {pending ? "Deleting…" : "Delete to-do"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
