export function withTimeout(promise, ms, createError) {
  if (!ms || ms <= 0) return Promise.resolve(promise);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(typeof createError === "function" ? createError() : createError);
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
