import Bing from "@thesvg/react/bing";
import Google from "@thesvg/react/google";
import GoogleAnalytics from "@thesvg/react/google-analytics";
import Hubspot from "@thesvg/react/hubspot";
import Instagram from "@thesvg/react/instagram";
import Linkedin from "@thesvg/react/linkedin";
import Mailchimp from "@thesvg/react/mailchimp";
import MicrosoftBing from "@thesvg/react/microsoft-bing";
import Pinterest from "@thesvg/react/pinterest";
import Reddit from "@thesvg/react/reddit";
import Shopify from "@thesvg/react/shopify";
import Tiktok from "@thesvg/react/tiktok";
import Whatsapp from "@thesvg/react/whatsapp";
import Wordpress from "@thesvg/react/wordpress";
import XFormerlyTwitter from "@thesvg/react/x-formerly-twitter";
import Youtube from "@thesvg/react/youtube";
import { createElement, useId } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  CallIcon,
  ChatIcon,
  GlobeIcon,
  MailIcon,
  PageIcon,
  SearchIcon,
} from "@/icons";

type AttributionSourceIconProps = {
  className?: string;
  fallbackKind?: AttributionFallbackKind;
  label?: string | null;
};

type AttributionSourceIconSlotProps = AttributionSourceIconProps & {
  iconClassName?: string;
};

export type AttributionFallbackKind =
  | "search"
  | "website"
  | "landing"
  | "form"
  | "phone"
  | "email"
  | "sms"
  | "crm"
  | "source";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
const centeredSvgProps = {
  focusable: false,
  preserveAspectRatio: "xMidYMid meet",
} satisfies Pick<SVGProps<SVGSVGElement>, "focusable" | "preserveAspectRatio">;

function FacebookBrandIcon({ className }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 666.667 666.667"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...centeredSvgProps}
    >
      <title>Facebook</title>
      <g transform="matrix(1.33333 0 0 -1.33333 -133.333 800)">
        <path
          fill="#1877F2"
          d="M0 0c0 138.071-111.929 250-250 250S-500 138.071-500 0c0-117.245 80.715-215.622 189.606-242.638v166.242h-51.552V0h51.552v32.919c0 85.092 38.508 124.532 122.048 124.532 15.838 0 43.167-3.105 54.347-6.211V81.986c-5.901.621-16.149.932-28.882.932-40.993 0-56.832-15.528-56.832-55.9V0h81.659l-14.028-76.396h-67.631v-171.773C-95.927-233.218 0-127.818 0 0"
          transform="translate(600 350)"
        />
        <path
          fill="#fff"
          d="m0 0 14.029 76.396H-67.63v27.019c0 40.372 15.838 55.899 56.831 55.899 12.733 0 22.981-.31 28.882-.931v69.253c-11.18 3.106-38.509 6.212-54.347 6.212-83.539 0-122.048-39.441-122.048-124.533V76.396h-51.552V0h51.552v-166.242a250.559 250.559 0 0 1 60.394-7.362c10.254 0 20.358.632 30.288 1.831V0Z"
          transform="translate(447.918 273.604)"
        />
      </g>
    </svg>
  );
}

function MetaBrandIcon({ className }: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, "");
  const gradientA = `${id}-meta-a`;
  const gradientB = `${id}-meta-b`;

  return (
    <svg
      viewBox="0 0 256 171"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...centeredSvgProps}
    >
      <defs>
        <linearGradient
          id={gradientA}
          x1="13.878%"
          x2="89.144%"
          y1="55.934%"
          y2="58.694%"
        >
          <stop offset="0%" stopColor="#0064E1" />
          <stop offset="40%" stopColor="#0064E1" />
          <stop offset="83%" stopColor="#0073EE" />
          <stop offset="100%" stopColor="#0082FB" />
        </linearGradient>
        <linearGradient
          id={gradientB}
          x1="54.315%"
          x2="54.315%"
          y1="82.782%"
          y2="39.307%"
        >
          <stop offset="0%" stopColor="#0082FB" />
          <stop offset="100%" stopColor="#0064E0" />
        </linearGradient>
      </defs>
      <path
        fill="#0081FB"
        d="M27.651 112.136c0 9.775 2.146 17.28 4.95 21.82 3.677 5.947 9.16 8.466 14.751 8.466 7.211 0 13.808-1.79 26.52-19.372 10.185-14.092 22.186-33.874 30.26-46.275l13.675-21.01c9.499-14.591 20.493-30.811 33.1-41.806C161.196 4.985 172.298 0 183.47 0c18.758 0 36.625 10.87 50.3 31.257C248.735 53.584 256 81.707 256 110.729c0 17.253-3.4 29.93-9.187 39.946-5.591 9.686-16.488 19.363-34.818 19.363v-27.616c15.695 0 19.612-14.422 19.612-30.927 0-23.52-5.484-49.623-17.564-68.273-8.574-13.23-19.684-21.313-31.907-21.313-13.22 0-23.859 9.97-35.815 27.75-6.356 9.445-12.882 20.956-20.208 33.944l-8.066 14.289c-16.203 28.728-20.307 35.271-28.408 46.07-14.2 18.91-26.324 26.076-42.287 26.076-18.935 0-30.91-8.2-38.325-20.556C2.973 139.413 0 126.202 0 111.148l27.651.988Z"
      />
      <path
        fill={`url(#${gradientA})`}
        d="M21.802 33.206C34.48 13.666 52.774 0 73.757 0 85.91 0 97.99 3.597 110.605 13.897c13.798 11.261 28.505 29.805 46.853 60.368l6.58 10.967c15.881 26.459 24.917 40.07 30.205 46.49 6.802 8.243 11.565 10.7 17.752 10.7 15.695 0 19.612-14.422 19.612-30.927l24.393-.766c0 17.253-3.4 29.93-9.187 39.946-5.591 9.686-16.488 19.363-34.818 19.363-11.395 0-21.49-2.475-32.654-13.007-8.582-8.083-18.615-22.443-26.334-35.352l-22.96-38.352C118.528 64.08 107.96 49.73 101.845 43.23c-6.578-6.988-15.036-15.428-28.532-15.428-10.923 0-20.2 7.666-27.963 19.39L21.802 33.206Z"
      />
      <path
        fill={`url(#${gradientB})`}
        d="M73.312 27.802c-10.923 0-20.2 7.666-27.963 19.39-10.976 16.568-17.698 41.245-17.698 64.944 0 9.775 2.146 17.28 4.95 21.82L9.027 149.482C2.973 139.413 0 126.202 0 111.148 0 83.772 7.514 55.24 21.802 33.206 34.48 13.666 52.774 0 73.757 0l-.445 27.802Z"
      />
    </svg>
  );
}

const brandIcons: Array<{
  component: IconComponent;
  match: string[];
}> = [
  { component: GoogleAnalytics, match: ["google analytics", "ga4", "analytics"] },
  { component: Google, match: ["google ads", "googlead", "adwords", "gads", "google", "organic google"] },
  { component: MicrosoftBing, match: ["microsoft bing", "bing ads", "microsoft ads"] },
  { component: Bing, match: ["bing"] },
  { component: MetaBrandIcon, match: ["meta ads", "meta"] },
  { component: FacebookBrandIcon, match: ["facebook", "fb"] },
  { component: Instagram, match: ["instagram", "insta"] },
  { component: Tiktok, match: ["tiktok", "tik tok"] },
  { component: Linkedin, match: ["linkedin", "linked in"] },
  { component: Youtube, match: ["youtube", "you tube"] },
  { component: XFormerlyTwitter, match: ["twitter", "x formerly twitter", "x.com"] },
  { component: Pinterest, match: ["pinterest"] },
  { component: Reddit, match: ["reddit"] },
  { component: Whatsapp, match: ["whatsapp", "whats app"] },
  { component: Mailchimp, match: ["mailchimp"] },
  { component: Hubspot, match: ["hubspot"] },
  { component: Shopify, match: ["shopify"] },
  { component: Wordpress, match: ["wordpress", "word press"] },
];

function normaliseSource(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function findBrandIcon(label: string | null | undefined) {
  const source = normaliseSource(label);
  if (!source) return null;

  return (
    brandIcons.find(({ match }) =>
      match.some((candidate) => {
        const normalisedCandidate = normaliseSource(candidate);
        return (
          source === normalisedCandidate ||
          source.includes(normalisedCandidate) ||
          source.includes(`${normalisedCandidate}.`)
        );
      }),
    )?.component ?? null
  );
}

function FallbackIcon({
  className = "h-4 w-4",
  kind,
}: {
  className?: string;
  kind: AttributionFallbackKind;
}) {
  if (kind === "search") return <SearchIcon className={className} />;
  if (kind === "website" || kind === "landing") {
    return <GlobeIcon className={className} />;
  }
  if (kind === "form") return <PageIcon className={className} />;
  if (kind === "phone") return <CallIcon className={className} />;
  if (kind === "email") return <MailIcon className={className} />;
  if (kind === "sms") return <ChatIcon className={className} />;

  return <GlobeIcon className={className} />;
}

export function attributionFallbackKindFromText(
  value: string | null | undefined,
): AttributionFallbackKind {
  const text = value?.toLowerCase() ?? "";

  if (
    text.includes("google") ||
    text.includes("bing") ||
    text.includes("ad") ||
    text.includes("organic") ||
    text.includes("search")
  ) {
    return "search";
  }

  if (text.includes("landing")) return "landing";
  if (text.includes("form") || text.includes("enquiry") || text.includes("lead")) {
    return "form";
  }
  if (text.includes("phone") || text.includes("call")) return "phone";
  if (text.includes("email") || text.includes("mail")) return "email";
  if (text.includes("sms") || text.includes("whatsapp")) return "sms";
  if (text.includes("web") || text.includes("site") || text.includes("page")) {
    return "website";
  }

  return text ? "source" : "crm";
}

export function AttributionSourceIcon({
  className = "h-4 w-4",
  fallbackKind = "source",
  label,
}: AttributionSourceIconProps) {
  const BrandIcon = findBrandIcon(label);

  if (BrandIcon) {
    return createElement(BrandIcon, { className, ...centeredSvgProps });
  }

  return <FallbackIcon className={className} kind={fallbackKind} />;
}

export function AttributionSourceIconSlot({
  className = "size-4",
  fallbackKind = "source",
  iconClassName = "block h-4 w-4",
  label,
}: AttributionSourceIconSlotProps) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-hidden leading-none [&>svg]:m-0 [&>svg]:block [&>svg]:shrink-0 ${className}`}
    >
      <AttributionSourceIcon
        className={iconClassName}
        fallbackKind={fallbackKind}
        label={label}
      />
    </span>
  );
}
