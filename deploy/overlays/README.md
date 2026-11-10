# Overlays

Everything in this directory except this README and `example/` is gitignored. Copy `example/` to a
directory of your own (for example `home/`), fill in the host, image, storage class, ingress
namespace and Authelia middleware, then:

```sh
kubectl apply -k deploy/overlays/home
```

Checklist:

- `/api/*` must pass through Authelia forward-auth, and Authelia must return `Remote-User`.
- The public route must **strip** any client-sent `Remote-User` header. The server only reads it
  on `/api/*` and rejects odd paths (`//`, `%`, `..`), but stripping it at the edge closes the gap
  if an ingress ever routes a path differently than the server.
- Put the forward-auth annotations or middleware on the `spellbook-api` Ingress only. The public
  Ingress never reaches Authelia, so Authelia needs a rule that covers the host (an existing
  wildcard rule is enough) but no `bypass` rule.
- If your controller can't strip request headers on the public route (for example Traefik serving
  the `nginx` class, where configuration snippets are off), the server's own checks still apply:
  it reads `Remote-User` only on `/api/*` and refuses `%`, `//`, `.` and `..` in paths.
- The NetworkPolicy must name the ingress controller's namespace.
