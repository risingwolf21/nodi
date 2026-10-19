import {
    ArrowUpRight,
    AtSign,
    Calendar,
    CheckSquare,
    CircleDot,
    Clock,
    Hash,
    History,
    Link,
    List,
    MapPin,
    Sigma,
    Tags,
    Type,
} from "lucide-react";
import type { PropertyType } from "../types";

const ICONS = {
    text: Type,
    number: Hash,
    checkbox: CheckSquare,
    select: List,
    multi_select: Tags,
    status: CircleDot,
    date: Calendar,
    url: Link,
    email: AtSign,
    place: MapPin,
    formula: Sigma,
    relation: ArrowUpRight,
    created_time: Clock,
    last_edited_time: History,
} satisfies Record<PropertyType, unknown>;

export function PropertyTypeIcon({ type, className = "size-3.5" }: { type: PropertyType; className?: string }) {
    const Icon = ICONS[type];
    return <Icon className={className} aria-hidden="true" />;
}
