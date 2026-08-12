"use client";

import { useEffect } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { PlusIcon } from "@/icons";
import { useModal } from "@/hooks/useModal";
import UserCreateForm from "@/components/crm-boilerplate/UserCreateForm";

export type UserCreateModalProps = {
  autoOpen?: boolean;
};

export default function UserCreateModal({ autoOpen }: UserCreateModalProps = {}) {
  const modal = useModal();
  const { openModal } = modal;

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      <Button size="sm" onClick={modal.openModal} startIcon={<PlusIcon />}>
        Add user
      </Button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[720px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Add user
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Create a closed-access CRM account with a client-facing role
            template. The user can change their password after signing in.
          </p>
          <UserCreateForm onSuccess={modal.closeModal} />
        </div>
      </Modal>
    </>
  );
}
