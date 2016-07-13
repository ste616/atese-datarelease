#!/usr/bin/perl

use JSON;
use strict;

my @epochs = @ARGV;
my $ref_json = shift @epochs;

# Determine the list of sources observed in all the epochs given, without counting the
# same source more than once.
my %sources;

if (!-e $ref_json) {
    die "Unable to load catalogue $ref_json\n";
}

open(C, $ref_json);
my $cattxt = <C>;
close(C);
my $ref_catalogue = from_json $cattxt;

if ($#epochs == -1) {
    # We just want total number of sources.
    my @srcs = keys %{$ref_catalogue};
    print "Found ".($#srcs + 1)." observed sources in those epochs.\n";
    exit;
}

foreach my $s (keys %{$ref_catalogue}) {
    my $e = $ref_catalogue->{$s}->{'epochs'};

    for (my $i = 0; $i <= $#{$e}; $i++) {
	my $efound = 0;
	for (my $j = 0; $j <= $#epochs; $j++) {
	    if ($e->[$i] eq $epochs[$j]) {
		$efound = 1;
		$sources{$s} = 1;
		last;
	    }
	}
	if ($efound == 1) {
	    last;
	}
    }
}

my @srcs = keys %sources;

print "Found ".($#srcs + 1)." observed sources in those epochs.\n";
