// @cashpilot/ui — design system. Plain props only (millimes as number, dates as "YYYY-MM-DD");
// never imports domain/application code. ForecastChart is exported from "@cashpilot/ui/chart" (lazy-loaded).
export { cn } from './lib/utils';
export * from './lib/format';

export { Button, buttonVariants, type ButtonProps } from './components/primitives/button';
export { Input, Textarea, Label, NativeSelect, Checkbox, Switch, Field, type FieldProps } from './components/primitives/form-controls';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  badgeVariants,
  Skeleton,
  Separator,
  Progress,
  Alert,
  AlertTitle,
  AlertDescription,
  Avatar,
  Kbd,
} from './components/primitives/layout';
export { Table, TableCaption, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from './components/primitives/table';
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  Tooltip,
  TooltipProvider,
} from './components/primitives/overlays';
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ToggleGroup,
  ToggleGroupItem,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Calendar,
  Toaster,
  toast,
} from './components/primitives/navigation';

export { Amount, type AmountProps } from './components/finance/amount';
export { MoneyInput, type MoneyInputProps } from './components/finance/money-input';
export { DateField, type DateFieldProps } from './components/finance/date-field';
export { StatusBadge, invoiceBadge, expenseBadge } from './components/finance/status-badge';
export {
  KpiCard,
  RunwayGauge,
  PageHeader,
  EmptyState,
  AlertItem,
  Pagination,
  StatList,
  type KpiCardProps,
  type RunwayGaugeProps,
  type PageHeaderProps,
  type EmptyStateProps,
} from './components/finance/widgets';
export { ErrorState, ConfirmDialog, FileDropzone, RECEIPT_ACCEPT, RECEIPT_MAX, type ConfirmDialogProps } from './components/finance/feedback';
export { ExplanationPanel, type ExplanationPanelProps, type ExplanationFlow } from './components/finance/explanation-panel';
export type { ChartPoint, ChartShortfall, ForecastChartProps } from './components/finance/forecast-chart';
