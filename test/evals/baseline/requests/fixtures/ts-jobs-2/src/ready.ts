/** Asks the database whether it accepts connections yet. It rejects when the host is unknown. */
export type Check = () => Promise<boolean>;
