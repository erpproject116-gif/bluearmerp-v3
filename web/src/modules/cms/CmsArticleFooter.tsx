import { A } from "@solidjs/router";
import { CMS_FACEBOOK_PAGE, facebookShareUrl } from "./cmsSocial";

export function CmsArticleFooter(props: { canonicalUrl: string }) {
  const share = () => facebookShareUrl(props.canonicalUrl);
  const nativeShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ url: props.canonicalUrl }).catch(() => undefined);
    }
  };
  return (
    <footer class="mt-8 border-t border-stroke pt-4 text-sm text-text-primary" aria-label="Follow Bluearm on Facebook">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"
          href={CMS_FACEBOOK_PAGE}
          rel="noopener noreferrer"
          target="_blank"
        >
          <img src="/facebook.svg" alt="" width="18" height="18" class="h-[18px] w-[18px]" />
          <span>Like and follow our page</span>
        </a>
        <a class="text-brand-600 hover:underline" href={CMS_FACEBOOK_PAGE} rel="noopener noreferrer" target="_blank">
          {CMS_FACEBOOK_PAGE}
        </a>
        <span>and</span>
        <a class="text-brand-600 hover:underline" href={share()} rel="noopener noreferrer" target="_blank" onClick={() => nativeShare()}>
          share our contents
        </a>
        .
      </p>
    </footer>
  );
}

export function CmsArticlesHomeLink() {
  return (
    <A href="/articles" class="text-brand-600 hover:underline">
      Articles
    </A>
  );
}
