function refLocator(page, ref) {
    // _snapshotForAI produces refs like [ref=e1], resolved via aria-ref= locator
    return page.locator(`aria-ref=${ref}`);
}
function requireRef(request) {
    if (!request.ref)
        throw new Error(`ref is required for action kind="${request.kind}"`);
    return request.ref;
}
export async function executeAct(page, request) {
    switch (request.kind) {
        case "click": {
            const ref = requireRef(request);
            const locator = refLocator(page, ref);
            const opts = {};
            if (request.button)
                opts.button = request.button;
            if (request.modifiers?.length) {
                opts.modifiers = request.modifiers;
            }
            if (request.doubleClick) {
                await locator.dblclick(opts);
            }
            else {
                await locator.click(opts);
            }
            return { ok: true };
        }
        case "type": {
            const ref = requireRef(request);
            const text = request.text ?? "";
            const locator = refLocator(page, ref);
            if (request.slowly) {
                await locator.pressSequentially(text, { delay: 50 });
            }
            else {
                await locator.fill(text);
            }
            if (request.submit) {
                await locator.press("Enter");
            }
            return { ok: true };
        }
        case "press": {
            const key = request.key;
            if (!key)
                throw new Error("key is required for action kind='press'");
            if (request.ref) {
                await refLocator(page, request.ref).press(key);
            }
            else {
                await page.keyboard.press(key);
            }
            return { ok: true };
        }
        case "hover": {
            const ref = requireRef(request);
            await refLocator(page, ref).hover();
            return { ok: true };
        }
        case "drag": {
            const startRef = request.startRef;
            const endRef = request.endRef;
            if (!startRef || !endRef)
                throw new Error("startRef and endRef are required for drag");
            const source = refLocator(page, startRef);
            const target = refLocator(page, endRef);
            await source.dragTo(target);
            return { ok: true };
        }
        case "fill": {
            const fields = request.fields;
            if (!fields?.length)
                throw new Error("fields array is required for fill");
            for (const field of fields) {
                await refLocator(page, field.ref).fill(field.value);
            }
            return { ok: true, filled: fields.length };
        }
        case "select": {
            const ref = requireRef(request);
            const values = request.values ?? [];
            await refLocator(page, ref).selectOption(values);
            return { ok: true };
        }
        case "wait": {
            if (request.text) {
                await page.getByText(request.text).waitFor({
                    timeout: request.timeoutMs ?? 10_000,
                });
                return { ok: true, waited: "text appeared" };
            }
            if (request.textGone) {
                await page.getByText(request.textGone).waitFor({
                    state: "hidden",
                    timeout: request.timeoutMs ?? 10_000,
                });
                return { ok: true, waited: "text gone" };
            }
            if (request.url) {
                await page.waitForURL(request.url, {
                    timeout: request.timeoutMs ?? 30_000,
                });
                return { ok: true, waited: "url" };
            }
            if (request.selector) {
                await page.locator(request.selector).waitFor({
                    timeout: request.timeoutMs ?? 10_000,
                });
                return { ok: true, waited: "selector" };
            }
            // Simple time wait
            const ms = request.timeMs ?? 1000;
            await page.waitForTimeout(ms);
            return { ok: true, waited: `${ms}ms` };
        }
        case "evaluate": {
            const fn = request.fn;
            if (!fn)
                throw new Error("fn is required for evaluate");
            const result = await page.evaluate(fn);
            return { ok: true, result };
        }
        default:
            throw new Error(`Unknown act kind: ${request.kind}`);
    }
}
