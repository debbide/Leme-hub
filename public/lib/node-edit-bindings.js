export const bindNodeEditEvents = ({
  closeModalBtns,
  closeModal,
  saveNodeBtn,
  saveNodeEdit,
  saveRestartBtn,
  runCoreAction,
}) => {
  closeModalBtns.forEach((button) => button.addEventListener('click', closeModal));

  saveNodeBtn?.addEventListener('click', saveNodeEdit);

  saveRestartBtn?.addEventListener('click', () => {
    runCoreAction('restart');
  });
};
