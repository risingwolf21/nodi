import {
    AtSign,
    Calendar,
    CheckSquare,
    CircleDot,
    Clock,
    Hash,
    History,
    Link,
    List,
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
    created_time: Clock,
    last_edited_time: History,
} satisfies Record<PropertyType, unknown>;

export function PropertyTypeIcon({ type, className = "size-3.5" }: { type: PropertyType; className?: string }) {
    const Icon = ICONS[type];
    return <Icon className={className} aria-hidden="true" />;
}
