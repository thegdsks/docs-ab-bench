import type { Route } from "./+types/product";

export const middleware: Route.MiddlewareFunction[] = [
  async (_args, next) => {
    const response = await next();
    response.headers.set("X-Shop-Route", "product");
    return response;
  },
];

export function loader() {
  return { title: "Blue Kettle" };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data.title} | Shop` }];
}

export default function Product({ loaderData }: Route.ComponentProps) {
  return <h1>{loaderData.title}</h1>;
}
