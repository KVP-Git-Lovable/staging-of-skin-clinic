import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";

export type ModalType = "appointments" | "appointmentDetail" | null;

interface ModalContextType {
  openModal: ModalType;
  selectedAppointmentId: string | null;
  setOpenModal: (modal: ModalType, appointmentId?: string) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextType>({
  openModal: null,
  selectedAppointmentId: null,
  setOpenModal: () => {},
  closeModal: () => {},
});

export const useModal = () => useContext(ModalContext);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [openModal, setOpenModalState] = useState<ModalType>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  // AppLayout clamps the shell to the viewport while an overlay is open, which makes
  // the browser drop the window scroll position. Remember it so closing an
  // appointment returns to the list where it was left, rather than at the top.
  const savedScrollY = useRef(0);

  const setOpenModal = (modal: ModalType, appointmentId?: string) => {
    // Read here, in the click handler: by the time an effect runs the shell has
    // already been clamped and scrollY reset.
    if (modal) savedScrollY.current = window.scrollY;
    setOpenModalState(modal);
    if (appointmentId) {
      setSelectedAppointmentId(appointmentId);
    }
  };

  useEffect(() => {
    if (openModal) return;
    const y = savedScrollY.current;
    if (!y) return;
    savedScrollY.current = 0;
    window.scrollTo(0, y);
  }, [openModal]);

  const closeModal = () => {
    setOpenModalState(null);
    setSelectedAppointmentId(null);
  };

  return (
    <ModalContext.Provider value={{ openModal, selectedAppointmentId, setOpenModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
}
