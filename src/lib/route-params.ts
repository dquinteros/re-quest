export type DynamicRouteContext<T extends Record<string, string>> = {
  params: T | Promise<T>;
};

export async function resolveRouteParams<T extends Record<string, string>>(
  context: DynamicRouteContext<T>,
): Promise<T> {
  return await context.params;
}
