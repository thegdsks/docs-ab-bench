// Calls the handler once with the given message.
export function notify(handler, message = 'ready') {
  handler(message)
}
