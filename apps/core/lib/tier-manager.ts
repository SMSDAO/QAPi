export type Tier = {
  id: string;
  name: string;
  level: number;
};

export const parseBearerToken = (token: string): string => {
  return token.split(' ')[1];
};

export const tierFromToken = (token: string): Tier => {
  const parsedToken = parseBearerToken(token);
  // Example parsing logic; adjust based on token structure
  const [id, name, level] = parsedToken.split('-');
  return { id, name, level: parseInt(level, 10) };
};

export const redactToken = (token: string): string => {
  return token.replace(/(\w{6})\w+/, '$1...');
};
