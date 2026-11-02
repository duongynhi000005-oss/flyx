import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from "@/shadcn-bridge/heroui/modal";

const modalBase = "!w-[calc(100%-32px)] !mx-auto sm:!w-full overflow-hidden";

export interface SheetAction {
  key: string;
  label: string;
  /** Only "danger" changes how the action looks (red, listed last). */
  color?: "primary" | "secondary" | "success" | "warning" | "danger";
  disabled?: boolean;
  onPress: () => void;
}

/** A small menu of actions for one item, opened by tapping it. */
export function ActionSheet({
  isOpen,
  title,
  subtitle,
  children,
  actions,
  onClose,
}: {
  isOpen: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}) {
  // One action per row; destructive ones go last so they are not hit by
  // accident.
  const ordered = [
    ...actions.filter((a) => a.color !== "danger"),
    ...actions.filter((a) => a.color === "danger"),
  ];

  return (
    <Modal
      classNames={{ base: modalBase }}
      isOpen={isOpen}
      placement="center"
      size="md"
      onOpenChange={(open) => !open && onClose()}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <h2 className="break-all text-base font-semibold">{title}</h2>
          {subtitle && (
            <div className="text-xs font-normal text-default-400">
              {subtitle}
            </div>
          )}
        </ModalHeader>
        <ModalBody className="pb-2">
          {children}
          <div className="-mx-1 divide-y divide-divider border-t border-divider">
            {ordered.map((a) => (
              <button
                key={a.key}
                className={`flex h-11 w-full items-center px-1 text-left text-sm transition-colors hover:bg-default-50 disabled:pointer-events-none disabled:opacity-40 ${
                  a.color === "danger" ? "text-danger" : "text-foreground"
                }`}
                disabled={a.disabled}
                type="button"
                onClick={() => {
                  onClose();
                  a.onPress();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
